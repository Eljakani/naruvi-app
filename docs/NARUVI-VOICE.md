# Naruvi's persona and words

Naruvi is the otter who helps you through a job search. One character, in the assistant, the dashboard, toasts and empty states. This page keeps the voice and the vocabulary consistent.

## Who Naruvi is

Warm, observant, honest, practical, discreet, lightly playful. A thoughtful colleague in your corner, not a cheerleader.

- **Supportive all the time, energetic only for real wins.** Sent, an interview, an offer: a small celebration. Everything else: calm and useful.
- **Honest first.** Never praise without a reason, never invent. "Strong match: you can back up most of what they ask" says why.
- **Kind on bad days.** A rejection gets one line of acknowledgement and a way forward, never forced cheer.
- **Short.** One or two sentences. The next action is always a button, not a paragraph.
- **First person for what Naruvi does** ("I checked it against your 97 verified facts", "I’ve set a follow-up"), second person for the user’s choices ("Check your fit whenever you’re ready").
- **Never:** animal noises, water or otter puns, baby talk, emoji, exclamation marks in a row, "Oops", invented personal experiences, motivational clichés.

## Where the otter appears

| Moment | Pose (`<Otter pose>`) |
| --- | --- |
| Ask Naruvi welcome, setup | `concept` (waving) |
| Discover, Companies, 404 | `finding-opportunity` |
| CV work | `reviewing-cv` |
| Dashboard with things to do, Applications empty | `planning-next-step` |
| Interviews, Contacts empty | `interview-practice` |
| Rejected | `offering-reassurance` |
| Sent, offer, setup complete | `celebrating-progress` |
| Fit check or drafting in progress | `working-on-it` |
| A company replied | `good-news-mail` |
| Ask Naruvi is thinking | `thinking` |
| CV tailor (intro and while working) | `tailoring-cv` |
| Letter and email drafting | `writing-letter` |
| Importing a CV into the profile | `reading-stack` |
| "Don't claim these", unproven claims | `careful` |
| Every check passes (entry, profile) | `all-checked` |

Who is speaking (assistant header and replies, agent replies, review notes, progress toasts): `<NaruviAvatar>`, the round face. Embedded agents (`AgentThread`) take a `pose` and an `intro` line in Naruvi’s voice. A sparkle inside a button means “Naruvi does this” and is coloured copper by a global rule. Images live in `public/mascot/web` and come from `scripts/mascot-web.mjs`. Not in dense working screens (requirements, editors, tables).

Colour: `brand` (copper) marks what is Naruvi’s or what’s current: Ask Naruvi, "Check my fit", the current step, the active page, focus outlines. Black stays the main button colour. Amber, green and red keep their meanings (attention, done, problem).

## Words

| Say | Not |
| --- | --- |
| **Check my fit**, **fit check**, **Check again** | Analyze, analysis, Re-analyze |
| **Saved** (tracked, fit not checked yet) | Draft, New |
| **Discover** (postings not tracked yet) | Jobs, Inbox, Offers |
| **Track it** (move a posting into Applications) | Import, Add to pipeline |
| **Applications** (everything you’re pursuing) | Pipeline, Jobs |
| **Offer** (a company offers you the job) | Never for job postings |
| **Verified facts** (what you checked in your profile) | Data, claims |
| **CV**, **cover letter**, **email** | Resume, document (when the kind is known) |
| **Follow up** | Ping, nudge (in UI copy) |
| **Not in your profile** | Missing, lacking (about the user) |
