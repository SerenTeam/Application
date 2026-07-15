# User Testing Protocol, Seren

> Moderated session protocol (45 to 60 minutes per participant, remote or in person).
> Goal: watch real users go through the full journey (sign-up, questionnaire, roadmap, letter) and identify usability friction as well as emotional discomfort.

---

## 1. Test objectives

What we want to learn (re-read this before each session):

1. **Comprehension.** Does the user understand what Seren does in under 30 seconds on the welcome screen?
2. **Questionnaire flow.** Are the 15 or so questions clear? Is the tone right (empathetic without being heavy)? Does the recap screen build confidence?
3. **Perceived value of the roadmap.** Does the list of steps reassure or overwhelm? Can the user tell what to start with?
4. **Letters.** Can the user find, understand and use a pre-filled letter?
5. **Emotional register.** At which moments does the product create discomfort, confusion, or on the contrary relief?

Out of scope for this session: performance, pricing, the marketing landing page.

---

## 2. Participants

- **Target:** 5 to 8 participants (major problems surface from 5 onwards).
- **Profiles we want:**
  - people who handled post-death paperwork **more than 12 months ago** (emotional distance), or
  - "family caregivers" likely to face it soon (45 to 70 years old, adult child of an elderly parent), or
  - 1 or 2 profiles with no experience of the topic at all (pure comprehension test).
- **To avoid:** anyone bereaved less than 6 months ago (risk of distress), friends and family of the team (politeness bias).
- Mix: comfortable and uncomfortable with digital tools; desktop and mobile; 1 or 2 sessions in English if possible (tests the FR/EN toggle).

---

## 3. Ethical precautions (specific to Seren, non-negotiable)

- [ ] The participant tests with a **fictional scenario we provide** (see section 5). We never ask them to use their own story or their real information.
- [ ] Say it upfront during the welcome: *"The topic is sensitive. You can pause or stop at any time, no explanation needed."*
- [ ] If the participant spontaneously brings up their own loss: listen briefly, do not dig, gently bring them back to the scenario.
- [ ] Signs of distress (tears, breaking voice, long silence): offer a break immediately; end the session if it persists. The session is worth less than the person.
- [ ] No real personal data typed into the app (test account provided, fictional persona).

---

## 4. Materials and preparation (the day before)

- [ ] **Environment:** deployed test instance (password-protected pre-production) or the app running locally (`npm run dev:all`). Run one full control session yourself to check the questionnaire works end to end.
- [ ] **Test accounts:** create one fresh account per participant (`usertest01@…`, `usertest02@…`). Each participant must start the questionnaire and roadmap from zero.
- [ ] **Persona sheet** printed or shared (see section 5).
- [ ] **Recording:** video call tool with screen sharing and recording (consent at the start of the session), or local screen capture.
- [ ] **Observation grid** duplicated for the session (see section 8).
- [ ] Timer, notepad.
- [ ] Roles assigned: one **facilitator** (talks, guides, never judges) and one **observer** (takes notes, keeps time, stays silent). If you are alone: record and take notes afterwards.

---

## 5. Persona sheet (hand it to the participant)

> Read it out loud with the participant and leave it in front of them for the whole session.

*"You will use Seren playing the following role. Nothing you type is real."*

- You are **the child of Pierre Dupont**, who died on **June 15th** at age 68.
- Pierre was **self-employed** (a craftsman), **owned his home**, and had **children who are all adults**.
- You do not know whether he had **life insurance**; he had taken out a **funeral insurance plan**.
- You had a **joint bank account** with him. No vehicle, no outstanding loans, no home help.
- No notaire has been contacted yet; you have not informed **any organization** so far.

(Feel free to prepare a second "spouse" persona for half of the sessions: Pierre's wife, employee, renting. It activates other roadmap steps.)

---

## 6. Session flow (45 to 60 minutes)

### Phase 0. Welcome and framing (5 min)

Facilitator script:

> "Thank you for being here. We are testing **the product, not you**: there are no right or wrong answers, and every hesitation you have is valuable information for us.
> I will ask you to **think out loud**: say everything that goes through your mind, what you are looking for, what surprises you.
> The topic is sensitive. You can **pause or stop at any time**.
> Do you allow me to **record** the screen and our conversation, for internal analysis only?"

- [ ] Recording consent obtained (verbal is enough, write it down).
- [ ] Hand over the persona sheet and read it together.

### Phase 1. Pre-test questions (3 min)

1. "Have you ever had to handle administrative procedures after a death?" (no details needed if they prefer not to)
2. "If yes: what was the hardest part?"
3. "How comfortable are you with digital tools day to day?" (self-rating, 1 to 5)

### Phase 2. First contact (5 min), *no instructions*

Open the app on the sign-in or welcome screen, then:

> "Without touching anything yet: what do you think this site offers? Who is it for?"

Write down the exact words they use. Then: "Go ahead, do whatever feels natural." (Give the test account credentials when the participant tries to sign in.)

### Phase 3. Task 1: the questionnaire (15 min)

Instruction:

> "Using the persona sheet, let Seren understand your situation."

Silent observation points (do not help unless they are stuck for more than 1 minute):
- Do they understand they need to click "Get started"?
- How smoothly do they answer? Which questions do they re-read?
- Reactions to the tone of the questions (write down verbatims).
- **On the recap screen:** do they read it? Ask: "Change your answer about the joint account" (tests the Edit button).
- Do they confirm with confidence?

### Phase 4. Task 2: the roadmap (10 min)

Instruction once the roadmap is generated:

> "Here is your personalized roadmap. Take a moment with it... What would you actually do first, tomorrow morning?"

Then:
1. "Find what Seren advises you to do about **your father's business**." (the URSSAF / one-stop-shop step; tests searching the list)
2. "You declared the death at the town hall (mairie) yesterday. Tell Seren." (checking off a step)
3. Open question: "Does this list reassure you or discourage you? Why?"

### Phase 5. Task 3: a letter (8 min)

Instruction:

> "You want to inform Pierre's bank. See if Seren can help you write that letter."

Observe: do they find the bank step and the "Generate letter" action? Do they understand the fields to fill in? Do they know what to do with the letter (copy, PDF)? If they are using the app in English: do they understand why the letter stays in French?

### Phase 6. (Optional, if time allows) Language switch (2 min)

> "You would rather use this site in English. Make it happen."

Do they find the FR/EN toggle? How do they react when the already-generated roadmap switches language?

### Phase 7. Debrief (8 min)

1. "In one sentence, what does Seren do?" (compare with Phase 2)
2. "What helped you most? What bothered you most?"
3. "Was there a moment where you felt uncomfortable?"
4. "Would you recommend it to someone close who just lost a loved one?" (0 to 10, plus why; qualitative NPS)
5. Self-rating: "Overall ease of use, from 1 to 5?"
6. "One thing to change first?"

Wrap-up: thank them, restate confidentiality, hand over the incentive if there is one.

---

## 7. Facilitator golden rules

- **Never guide.** Answer questions with a question ("What would you do if I were not here?").
- Let silences breathe; only step in after a real **1 minute** of being stuck.
- Write down **exact verbatims** (in quotes), not paraphrases.
- Never say "no, that's not how it works". Say "interesting, keep going".
- Do not explain the product before Phase 7.

---

## 8. Observation grid (duplicate per participant)

| # | Task | Success (yes / with help / no) | Time | Errors and hesitations | Notable verbatims |
|---|------|-------------------------------|------|------------------------|-------------------|
| 2 | Welcome screen comprehension | | | | |
| 3 | Full questionnaire | | | | |
| 3b | Edit an answer on the recap | | | | |
| 4a | Find the "business" step | | | | |
| 4b | Check off a completed step | | | | |
| 5 | Generate and use a letter | | | | |
| 6 | Switch to English | | | | |

**Emotional scale** (note it live, per phase): 😊 relieved / 😐 neutral / 😕 confused / 😟 uncomfortable, with the trigger.

---

## 9. After each session (15 min, while it is fresh)

- [ ] Complete the observation grid right away.
- [ ] Write down the **3 most serious problems** seen in the session.
- [ ] Any moment of emotional discomfort? Describe it precisely (which screen, which wording).

## 10. Synthesis after the testing round

- [ ] Consolidate every problem in a single table: **Problem / Frequency (x out of N participants) / Severity (blocking, major, minor) / Possible fix**.
- [ ] Prioritize: blockers first, then frequency times severity.
- [ ] Pull out 5 to 10 verbatims for the team (and for investors).
- [ ] Decide: fixes go to the product backlog; retest the blockers in the next round.
- [ ] Delete the test accounts and the recordings once the analysis is done (confidentiality commitment).
