---
name: jonas-writing-style
description: Write, rewrite, edit, or review technical content in Jonas Herrmannsdörfer's writing style. Use when drafting articles, guides, documentation, talks, emails, LinkedIn posts, Slack-ready explanations, or when the user asks to make writing sound like Jonas, match their writing rules, polish tone, simplify copy, or apply their Vercel-focused writing style.
---

# Jonas writing style

Use this skill to write like Jonas: clear, direct, helpful, and conversational. The goal is to sound like a knowledgeable colleague explaining a technical topic without hype or filler.

## Core voice

- Write like you're explaining something to a friend who knows how to code.
- Be direct, but not cold.
- Be helpful, but not condescending.
- Prefer simple words over fancy ones.
- Use active voice.
- Use contractions when they sound natural.
- Keep the reader's task at the center.
- Make technical tradeoffs clear without making them dramatic.

## Default structure

Start with the useful part. Don't build a long setup.

For guides and tutorials:

1. State what the reader wants to do.
2. Summarize the approach in one sentence.
3. Show the steps.
4. Explain why it works.
5. Add edge cases or caveats near the end.

For troubleshooting:

1. State what the error or symptom means.
2. Give the fix.
3. Explain why the fix works, briefly.
4. Add prevention steps only if they help.

For opinion or workflow pieces:

1. State the concrete problem.
2. Explain what you wanted instead.
3. Show the setup or workflow.
4. Explain the reasoning behind the choices.
5. Be specific about tradeoffs.

## Sentence style

- Keep most sentences short.
- Use one idea per sentence.
- Break long explanations into two sentences.
- Use `you` when the reader is taking action.
- Use `I` when describing personal workflow or experience.
- Use present tense unless a timeline matters.
- Define jargon the first time it appears.
- Read the sentence out loud. If it sounds stiff, rewrite it.

## Preferred phrasing

Use phrases like:

- "Here's how I set it up."
- "The tricky part is..."
- "In practice, you'll also need..."
- "This setup lets you..."
- "That means..."
- "The logic is..."
- "A simpler approach is..."
- "If you only need X, do Y."

Prefer:

- "use" over "utilize"
- "run" over "execute" unless execution is the technical term
- "set up" over "configure" when the action is general
- "start" over "initiate"
- "because" over "due to the fact that"
- "before you start" over "prerequisites" in friendlier guides

## Avoid

- Em dashes in explanations. Use periods, commas, or colons.
- Semicolons in lists.
- Hype: "game-changing", "revolutionary", "incredible", "amazing", "massive impact".
- Formal transitions: "furthermore", "moreover", "additionally".
- Rhetorical setup: "you might wonder", "you may be thinking", "here's the catch".
- Empty reassurance: "don't worry", "this is easy", "simply".
- Generic intros like "In today's fast-paced world".
- Marketing copy that describes features without showing what the user can do.
- Passive voice when active voice is clearer.
- Repeating the same idea in nearby paragraphs.

## Headings

- Use sentence case.
- Make headings explain the task or value.
- Prefer concrete headings over generic labels.

Examples:

- Good: "Before you start"
- Good: "Why multi-model routing matters"
- Good: "Keep components server-side by default"
- Avoid: "Configuration Options"
- Avoid: "Best Practices"

## Markdown rules

- Add a blank line before bullet lists.
- Add a blank line before and after code fences.
- Use language identifiers on code fences.
- Use `**Label:** explanation` instead of `**Label** - explanation`.
- Keep metadata short and useful when the format needs it.

## Technical content rules

- Verify technical claims before stating them as fact.
- For Vercel content, use official Vercel docs as sources.
- For Next.js content, use official Next.js docs as sources.
- Link claims to official docs when writing publishable content.
- Don't speculate about product behavior or future features.
- Be honest about plan limits, caveats, and version requirements.
- If a claim is unverified, either verify it or phrase it as something to check.

## Code examples

- Show realistic code, not toy code unless the concept needs it.
- Explain why the code matters before or inside the example.
- Add comments for intent, not obvious syntax.
- Prefer small examples that compile.
- Show bad and good examples when comparison helps.

Comment style:

```ts
// This keeps the large object on the server and only sends the field the UI needs.
<ClientComponent userName={user.name} />
```

Avoid comments like:

```ts
// Set userName prop
<ClientComponent userName={user.name} />
```

## Editing workflow

When rewriting existing text:

1. Preserve the author's intent.
2. Cut filler and repeated ideas.
3. Move the answer closer to the top.
4. Replace formal wording with plain wording.
5. Split long sentences.
6. Check headings for sentence case.
7. Remove em dashes, hype, and AI-like transitions.
8. Keep the final text natural when read aloud.

## Quality check

Before finalizing, check:

- Does it answer the reader's actual task?
- Does the first paragraph state the problem and direction?
- Would Jonas say this out loud?
- Are the sentences short enough?
- Are technical claims verified or clearly framed?
- Are headings sentence case?
- Are bullet lists separated by blank lines?
- Are there any em dashes, hype words, or formal transitions?

For a compact review checklist, read `references/checklist.md`.
