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
import { useEffect, useState } from "react";
import {
  fetchCustomerSearchIndex,
  fetchLabelGroup,
  createLinearTicket,
} from "./lib/linear.js";

function buildCustomerKeywords(name: string): string[] {
  const lower = name.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  const alnum = lower.replace(/[^a-z0-9]/g, "");
  const dashed = lower.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const words = lower.split(/[^a-z0-9]+/g).filter(Boolean);

  return Array.from(new Set([lower, compact, alnum, dashed, ...words])).filter(
    (value) => value.length > 1,
  );
}

export default function CreateTicket() {
  const [teamId, setTeamId] = useState("");
  const [dseCore, setDseCore] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: customerIndex, isLoading: customerLoading } = useCachedPromise(
    fetchCustomerSearchIndex,
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
  const isLoading = customerLoading || coreLoading;
  const customerMap = new Map(
    (customerIndex ?? []).map((entry) => [entry.customerName, entry.teamId]),
  );
  const customerOptions = Array.from(customerMap.keys()).sort();

  useEffect(() => {
    if (dseCore || !dseCoreLabels || dseCoreLabels.length === 0) {
      return;
    }

    const requestLabel =
      dseCoreLabels.find((label) => /request/i.test(label.name)) ??
      dseCoreLabels[0];
    setDseCore(requestLabel.id);
  }, [dseCore, dseCoreLabels]);

  async function handleSubmit(values: {
    title: string;
    description: string;
    customerName: string;
    teamId: string;
    dseCore: string;
  }) {
    if (!values.title.trim()) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Title is required",
      });
      return;
    }
    if (!dseCore) {
      await showToast({
        style: Toast.Style.Failure,
        title: "DSE-Core label is required",
      });
      return;
    }

    // Build label names array
    const coreLabelName =
      dseCoreLabels?.find((l) => l.id === dseCore)?.name ?? "";
    const allLabels = [coreLabelName].filter(Boolean);

    setIsSubmitting(true);
    try {
      const result = await createLinearTicket({
        title: values.title.trim(),
        description: values.description.trim(),
        customerName: values.customerName || undefined,
        teamId: values.teamId.trim() || undefined,
        labels: allLabels,
      });

      if (result.success) {
        const ticketUrl =
          result.url ??
          (result.identifier
            ? `https://linear.app/vercel/issue/${result.identifier}`
            : undefined);

        await showToast({
          style: Toast.Style.Success,
          title: "Ticket Created",
          message: result.identifier,
          ...(ticketUrl
            ? {
                primaryAction: {
                  title: "Open in Linear",
                  onAction: () => open(ticketUrl),
                },
              }
            : {}),
        });

        if (ticketUrl) {
          await open(ticketUrl);
        }
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
        storeValue
        onChange={(value) => {
          const tid = customerMap.get(value);
          if (tid) setTeamId(tid);
          else if (!value) setTeamId("");
        }}
      >
        <Form.Dropdown.Item value="" title="Select customer (optional)" />
        {customerOptions.map((name) => (
          <Form.Dropdown.Item
            key={name}
            value={name}
            title={name}
            keywords={buildCustomerKeywords(name)}
          />
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
      <Form.Dropdown
        id="dseCore"
        title="DSE-Core *"
        storeValue
        value={dseCore}
        onChange={setDseCore}
      >
        <Form.Dropdown.Item value="" title="Select DSE-Core label" />
        {(dseCoreLabels ?? []).map((label) => (
          <Form.Dropdown.Item
            key={label.id}
            value={label.id}
            title={label.name}
          />
        ))}
      </Form.Dropdown>
    </Form>
  );
}
