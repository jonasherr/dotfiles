import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  popToRoot,
  open,
  Icon,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { useState } from "react";
import {
  fetchTeamTickets,
  fetchLabelGroup,
  getCustomerMap,
  createLinearTicket,
} from "./lib/linear.js";

export default function CreateTicket() {
  const [teamId, setTeamId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch team tickets for customer dropdown
  const { data: tickets, isLoading: ticketsLoading } = useCachedPromise(
    fetchTeamTickets,
    [],
    {
      keepPreviousData: true,
    },
  );

  // Fetch label groups
  const { data: dseCoreLabels, isLoading: coreLoading } = useCachedPromise(
    fetchLabelGroup,
    ["DSE-Core"],
    { keepPreviousData: true },
  );
  const { data: dseLoeLabels, isLoading: loeLoading } = useCachedPromise(
    fetchLabelGroup,
    ["DSE-LOE"],
    { keepPreviousData: true },
  );
  const { data: dseReqsLabels, isLoading: reqsLoading } = useCachedPromise(
    fetchLabelGroup,
    ["DSE-Reqs"],
    { keepPreviousData: true },
  );

  const isLoading = ticketsLoading || coreLoading || loeLoading || reqsLoading;
  const customerMap = tickets
    ? getCustomerMap(tickets)
    : new Map<string, string | null>();
  const customerOptions = Array.from(customerMap.keys()).sort();

  async function handleSubmit(values: {
    title: string;
    description: string;
    customerName: string;
    teamId: string;
    dseCore: string;
    dseLoe: string[];
    dseReqs: string[];
  }) {
    if (!values.title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Title is required",
      });
      return;
    }
    if (!values.dseCore) {
      await showToast({
        style: Toast.Style.Failure,
        title: "DSE-Core label is required",
      });
      return;
    }

    // Build label names array
    const coreLabelName =
      dseCoreLabels?.find((l) => l.id === values.dseCore)?.name ?? "";
    const loeLabelNames = (dseLoeLabels ?? [])
      .filter((l) => values.dseLoe.includes(l.id))
      .map((l) => l.name);
    const reqsLabelNames = (dseReqsLabels ?? [])
      .filter((l) => values.dseReqs.includes(l.id))
      .map((l) => l.name);
    const allLabels = [
      coreLabelName,
      ...loeLabelNames,
      ...reqsLabelNames,
    ].filter(Boolean);

    setIsSubmitting(true);
    try {
      const result = await createLinearTicket({
        title: values.title.trim(),
        description: values.description.trim(),
        customerName: values.customerName || undefined,
        teamId: values.teamId.trim() || undefined,
        labels: allLabels,
      });

      if (result.success && result.url) {
        await showToast({
          style: Toast.Style.Success,
          title: "Ticket Created",
          message: result.identifier,
          primaryAction: {
            title: "Open in Linear",
            onAction: () => open(result.url!),
          },
        });
        popToRoot();
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to Create Ticket",
          message: result.error ?? "Unknown error",
        });
      }
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Error",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form
      isLoading={isLoading || isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Ticket"
            icon={Icon.Plus}
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Issue title"
        autoFocus
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Ticket description (Markdown supported)"
      />
      <Form.Separator />
      <Form.Dropdown
        id="customerName"
        title="Customer"
        onChange={(value) => {
          const tid = customerMap.get(value);
          if (tid) setTeamId(tid);
          else if (!value) setTeamId("");
        }}
      >
        <Form.Dropdown.Item value="" title="Select customer (optional)" />
        {customerOptions.map((name) => (
          <Form.Dropdown.Item key={name} value={name} title={name} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="teamId"
        title="Team ID"
        placeholder="e.g., team_abc123 (auto-filled from customer)"
        value={teamId}
        onChange={setTeamId}
      />
      <Form.Separator />
      <Form.Dropdown id="dseCore" title="DSE-Core *" storeValue>
        <Form.Dropdown.Item value="" title="Select DSE-Core label" />
        {(dseCoreLabels ?? []).map((label) => (
          <Form.Dropdown.Item
            key={label.id}
            value={label.id}
            title={label.name}
          />
        ))}
      </Form.Dropdown>
      <Form.TagPicker id="dseLoe" title="DSE-LOE">
        {(dseLoeLabels ?? []).map((label) => (
          <Form.TagPicker.Item
            key={label.id}
            value={label.id}
            title={label.name}
          />
        ))}
      </Form.TagPicker>
      <Form.TagPicker id="dseReqs" title="DSE-Reqs">
        {(dseReqsLabels ?? []).map((label) => (
          <Form.TagPicker.Item
            key={label.id}
            value={label.id}
            title={label.name}
          />
        ))}
      </Form.TagPicker>
    </Form>
  );
}
