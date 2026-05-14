# Strava skills project

This folder contains implementation plans for a Strava API helper CLI and two Pi/Claude skills:

1. `strava-cli-plan.md` - build a safe local CLI around the Strava API.
2. `strava-route-planner-skill-plan.md` - create routes and bikepacking plans.
3. `strava-training-analyst-skill-plan.md` - read training data and provide coaching-style analysis.

The intended safety model is:

- Allowed: read Strava data, create new routes, import/add planned routes.
- Not allowed: delete activities/routes, edit existing activities/runs/rides, change private user data, or modify historical training records.
- Credentials should live outside the repo, preferably in 1Password, environment variables, or macOS Keychain.
