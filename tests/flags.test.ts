import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// server.js démarre le serveur à l'import : son câblage se vérifie sur le source (patron assumé,
// complété par le boot check de la Task 13).
const serverSource = () => readFileSync(path.join(process.cwd(), 'server/server.js'), 'utf8')

describe('server.js — FEATURE_LLM (chantier 5 : LLM coupé par défaut)', () => {
  it('Mistral instancié UNIQUEMENT si flagOn(FEATURE_LLM) ET clé présente', () => {
    const source = serverSource()
    expect(source).toMatch(/const llmEnabled = flagOn\('FEATURE_LLM'\) && Boolean\(process\.env\.MISTRAL_API_KEY\)/)
    expect(source).toMatch(/llmEnabled \? new Mistral\(\{ apiKey: process\.env\.MISTRAL_API_KEY \}\) : null/)
    expect(source.match(/new Mistral\(/g)).toHaveLength(1)
  })
  it('le router questionnaire reçoit le client éventuellement null (jamais le constructeur brut)', () => {
    expect(serverSource()).toMatch(/mistral: mistralClient/)
  })
})
