---
name: strava-training-analyst
description: Analyze Strava training data using the local strava-local CLI. Use when the user asks about rides, runs, training history, fitness trends, weekly volume, elevation, heart rate, power, cadence, pace, speed, fatigue, consistency, race preparation, recovery, or what to do next based on Strava activities.
---

# Strava Training Analyst

Use `strava-local` to read Strava data and produce coaching-style analysis. This skill is read-only.

## Safety

Allowed:

- Read athlete profile, activities, stats, zones, and selected streams.
- Write local JSON or Markdown reports.

Forbidden:

- Edit, delete, upload, rename, or change privacy for Strava data.
- Make medical diagnoses. For injury, chest pain, dizziness, or unusual fatigue, recommend professional medical advice.

## Workflow

1. Clarify the question and date range if needed.
2. Use a small useful range first:
   - recent training: last 4 weeks
   - trends: last 8 to 12 weeks
   - annual view: year to date
3. Prefer normalized helpers:

```bash
strava-local training weekly --after YYYY-MM-DD --before YYYY-MM-DD --out weekly.json
strava-local training summary --after YYYY-MM-DD --before YYYY-MM-DD --out summary.json
```

4. Fetch streams only for specific workouts where detail matters:

```bash
strava-local activities streams ACTIVITY_ID --keys time,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp --out streams.json
```

5. Explain caveats: missing sensors, indoor rides, terrain, pauses, weather, and device changes.

## Report format

```markdown
# Strava training analysis

## Executive summary
## What I looked at
## Key trends
## Strengths
## Watch-outs
## Recommendations
## Suggested next week
## Caveats
```

Keep recommendations practical and conservative. Do not overinterpret one activity.
