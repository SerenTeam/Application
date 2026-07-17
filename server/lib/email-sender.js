// Adaptateur d'envoi d'email (Resend). `resendClient` est injecté (tests : fake ; production :
// instance réelle construite dans server.js à partir de RESEND_API_KEY). Le sender ne connaît
// pas la BDD ni les statuts métier — il ne fait que parler au provider et remonter
// providerRef/status, ou lever une exception que la route traduit en réponse HTTP.
export function createEmailSender({ resendClient, from }) {
  return {
    async send({ pdf, subject, recipientEmail, filename }) {
      // Service non configuré (dev local avant le USER STEP, ou déploiement incomplet) :
      // RESEND_API_KEY et RESEND_FROM vont ensemble — sans expéditeur vérifié, Resend
      // rejetterait l'appel de toute façon. L'absence de l'un OU de l'autre est donc un
      // 503 « non configuré » explicite, pas un échec d'envoi (502) ni un throw obscur.
      if (!resendClient || !from) {
        throw new Error('email_not_configured')
      }
      const { data, error } = await resendClient.emails.send({
        from,
        to: recipientEmail,
        subject,
        text: 'Veuillez trouver ci-joint le courrier.', // corps minimal : le courrier EST la PJ
        attachments: [{ filename, content: pdf.toString('base64') }],
      })
      if (error) throw new Error(error.message ?? 'resend_error')
      return { providerRef: data.id, status: 'sent' }
    },
  }
}
