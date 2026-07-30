# Kitty Sessions

Raycast navigation for Kitty sessions, projects, and customers.

## Customer metadata

Set the extension's **Customers Directory** preference to a private directory containing one folder per customer.

Each folder appears in the **Customers** view. The folder name is used until the folder contains a `customer.md` file with this frontmatter:

```md
---
name: Example Customer
team_id: team_EXAMPLE1234567890
classification: customer
---
```

- `name` controls the customer name shown in Raycast.
- `team_id` adds an admin action when **Customer Admin URL Template** is configured.
- `classification: collection` excludes organizational folders from the Customers view.
- Selecting a customer opens its folder in a new tab in the Kitty `customers` session.

Configure the optional admin URL preference with a `{team_id}` placeholder, for example:

```text
https://admin.example.com/team/{team_id}
```

`name` and `team_id` are optional while metadata is being populated. The extension ignores malformed team IDs rather than constructing an invalid admin URL.
