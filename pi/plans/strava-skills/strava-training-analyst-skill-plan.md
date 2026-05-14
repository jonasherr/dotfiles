# Plan: `strava-training-analyst` skill

## Goal

Create a skill that uses the local `strava-local` CLI to read Strava training data and provide coaching-style analysis. It should help the user understand training load, consistency, endurance, climbing, speed/pace, heart rate, power, cadence, and trends over time.

The skill must be read-only. It should never edit or delete real Strava data.

## Skill name

`strava-training-analyst`

## Draft description

Analyze Strava training data using the local Strava API CLI and provide coaching-style recommendations. Use this skill whenever the user asks about their rides, runs, training history, fitness trends, weekly volume, elevation, heart rate, power, cadence, pace, speed, fatigue, consistency, race preparation, recovery, or how to improve based on Strava activities. This skill should trigger for questions like “how is my training going?”, “am I improving?”, “what should I do next week?”, or “look at my Strava data”, even if the user does not explicitly mention analysis.

## Dependencies

- `strava-local` CLI from `strava-cli-plan.md`.
- Strava API credentials available through environment variables, ideally loaded from 1Password.

## Safety model

Allowed:

- read athlete profile
- read activities
- read activity streams
- read zones/stats where available
- write local analysis files

Forbidden:

- delete activities
- edit activities
- upload activities
- change activity names, descriptions, gear, privacy, or metadata
- modify athlete profile
- make medical claims

The skill can give training guidance, but it should avoid pretending to be a doctor. For injury, chest pain, dizziness, unusual fatigue, or health concerns, recommend professional medical advice.

## Data to retrieve

Use the smallest useful date range first.

Common commands:

```bash
strava-local activities list --after YYYY-MM-DD --before YYYY-MM-DD --out activities.json
strava-local activities get <activity-id> --out activity.json
strava-local activities streams <activity-id> --keys time,distance,altitude,velocity_smooth,heartrate,cadence,watts,temp --out streams.json
strava-local athlete stats --out stats.json
```

Data fields to analyze when available:

- distance
- moving time
- elapsed time
- elevation gain
- sport type
- average and max speed/pace
- heart rate average/max
- power average/weighted average/normalized-like fields if available
- cadence
- calories, if available
- relative effort/suffer score, if available
- activity frequency
- long ride/run progression
- weekly totals
- rest days
- intensity distribution

## Skill workflow

1. Identify the analysis question.
2. Choose a time window:
   - last 4 weeks for recent training
   - last 12 weeks for trend analysis
   - year-to-date for annual patterns
   - custom range if requested
3. Retrieve activity summaries with `strava-local`.
4. Pull streams only for activities where detail matters, such as key workouts, long rides, power/HR analysis, or anomaly checks.
5. Calculate simple aggregates locally:
   - weekly distance/time/elevation
   - activity count
   - long ride/run trend
   - easy/hard distribution based on HR/power if available
   - average cadence and power trends where useful
6. Explain caveats: missing sensors, indoor vs outdoor, pauses, weather, terrain, and device differences.
7. Give practical coaching-style recommendations.

## Output format

Default report:

```markdown
# Strava training analysis

## Executive summary

## What I looked at
- Date range:
- Activity types:
- Data available:

## Key trends

## Strengths

## Watch-outs

## Recommendations

## Suggested next week

## Caveats
```

For “what should I do next week?” include a simple week plan:

```markdown
## Suggested next week
| Day | Session | Purpose |
| --- | --- | --- |
```

## Coaching principles

Prefer practical and conservative recommendations:

- Increase volume gradually.
- Separate hard days with easy/recovery days.
- Use long rides/runs for endurance progression.
- Use intervals sparingly and purposefully.
- Do not overinterpret one bad workout.
- Mention data gaps instead of inventing precision.

For cycling, consider:

- endurance volume
- climbing load
- power distribution
- cadence patterns
- long ride progression
- recovery between hard rides

For running, consider:

- pace trends
- weekly distance
- long run progression
- HR drift if streams are available
- intensity distribution

## Local helper scripts

The implementation agent may add scripts used by the skill, for example:

```text
scripts/
├── summarize_activities.py
├── weekly_training_report.py
└── inspect_streams.py
```

These scripts should read exported JSON files from `strava-local` and produce Markdown/JSON summaries.

## Test prompts for later evals

Use mocked Strava exports, not real private data.

1. “Look at my last 8 weeks of Strava rides and tell me if I’m building endurance or just riding randomly.”
2. “Analyze my cycling training for climbing. Use distance, elevation, HR, power, and cadence if available. What should I improve next month?”
3. “I have a 160 km road ride in 10 weeks. Based on my Strava history, suggest next week’s training and explain the reasoning.”

## Open questions for implementation agent

- Should the skill support both cycling and running from the start, or optimize for road cycling first?
- Should generated reports be saved automatically under `strava-output/training/`?
- Which metrics from Strava’s API are consistently available for the user's account and devices?
