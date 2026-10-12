# skills

The skills taxonomy: transferable abilities (derivatives, integration, reading comprehension, attention to detail…) as opposed to topics (content).

- `taxonomy.js` — families, sub-skills with stable ids, legacy tag mapping, `normaliseSkillIds`, `inferSkills` (conservative keyword fallback), `skillsForQuestion`, `skillPromptList` (the list shown to the model), `refresherFor`.
- Questions are tagged at generation (`requires_skills`); `activities/engine/activity.ts` normalises them (or infers them) into `ActivityQuestion.skills`, and every answered question carries them into the attempt.
- `performance/skillDiagnosis.js` reads attempts and says, per topic, whether the problem is a skill, the topic, both, or not enough evidence.
