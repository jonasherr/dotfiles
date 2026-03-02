import { List } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import { fetchTickets, groupByState, STATE_ORDER } from "./lib/linear.js";
import { TicketItem } from "./lib/components.js";

export default function MyTickets() {
  const [stateFilter, setStateFilter] = useState<string>("all");
  const { data, isLoading } = useCachedPromise(fetchTickets, [], { keepPreviousData: true });

  const grouped = data ? groupByState(data) : new Map();
  const statesToShow = stateFilter === "all" ? STATE_ORDER : [stateFilter];

  return (
    <List
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown tooltip="Filter by state" value={stateFilter} onChange={setStateFilter}>
          <List.Dropdown.Item title="All States" value="all" />
          {STATE_ORDER.map((s) => (
            <List.Dropdown.Item key={s} title={s} value={s} />
          ))}
        </List.Dropdown>
      }
    >
      {statesToShow.map((state) => {
        const tickets = grouped.get(state) ?? [];
        if (tickets.length === 0 && stateFilter === "all") return null;
        return (
          <List.Section key={state} title={state} subtitle={`${tickets.length} ticket${tickets.length !== 1 ? "s" : ""}`}>
            {tickets.map((ticket) => (
              <TicketItem key={ticket.issue.identifier} ticket={ticket} />
            ))}
          </List.Section>
        );
      })}
    </List>
  );
}
