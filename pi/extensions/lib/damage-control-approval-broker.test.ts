import assert from "node:assert/strict"
import test from "node:test"

import {
  createApprovalBroker,
  requestParentApproval,
} from "./damage-control-approval-broker.ts"

const SOCKET_ENV = "PI_DAMAGE_CONTROL_APPROVAL_SOCKET"
const TOKEN_ENV = "PI_DAMAGE_CONTROL_APPROVAL_TOKEN"

test("reports a balanced parent approval lifecycle", async () => {
  const originalSocket = process.env[SOCKET_ENV]
  const originalToken = process.env[TOKEN_ENV]
  const states: Array<{ active: boolean; id: string; label: string }> = []
  let markApprovalRequested: (() => void) | undefined
  const approvalRequested = new Promise<void>((resolve) => {
    markApprovalRequested = resolve
  })

  let completeApproval: ((approved: boolean) => void) | undefined
  const context = { hasUI: true } as any

  const broker = await createApprovalBroker(context, {
    requestApproval: () =>
      new Promise<boolean>((resolve) => {
        completeApproval = resolve
      }),
    onApprovalStateChange: (state) => {
      states.push(state)
      if (state.active) markApprovalRequested?.()
    },
  })
  process.env[SOCKET_ENV] = broker.env[SOCKET_ENV]
  process.env[TOKEN_ENV] = broker.env[TOKEN_ENV]

  try {
    const responsePromise = requestParentApproval({
      category: "Recursive deletion",
      matched: "rm -rf",
      subject: "rm -rf ./dist",
    })
    await approvalRequested
    while (!completeApproval) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }

    assert.deepEqual(states.map(({ active, label }) => ({ active, label })), [
      {
        active: true,
        label: "Recursive deletion: rm -rf ./dist",
      },
    ])

    completeApproval?.(true)
    assert.deepEqual(await responsePromise, { approved: true })
    assert.equal(states[0].id, states[1].id)
    assert.deepEqual(states.map(({ active, label }) => ({ active, label })), [
      {
        active: true,
        label: "Recursive deletion: rm -rf ./dist",
      },
      {
        active: false,
        label: "Recursive deletion: rm -rf ./dist",
      },
    ])
  } finally {
    await broker.close()
    if (originalSocket === undefined) delete process.env[SOCKET_ENV]
    else process.env[SOCKET_ENV] = originalSocket
    if (originalToken === undefined) delete process.env[TOKEN_ENV]
    else process.env[TOKEN_ENV] = originalToken
  }
})

test("keeps concurrent queued approvals balanced", async () => {
  const originalSocket = process.env[SOCKET_ENV]
  const originalToken = process.env[TOKEN_ENV]
  const states: Array<{ active: boolean; id: string; label: string }> = []
  const resolvers: Array<(approved: boolean) => void> = []
  const broker = await createApprovalBroker({ hasUI: true } as any, {
    requestApproval: () =>
      new Promise<boolean>((resolve) => {
        resolvers.push(resolve)
      }),
    onApprovalStateChange: (state) => states.push(state),
  })
  process.env[SOCKET_ENV] = broker.env[SOCKET_ENV]
  process.env[TOKEN_ENV] = broker.env[TOKEN_ENV]

  try {
    const first = requestParentApproval({
      category: "First",
      matched: "first rule",
      subject: "first command",
    })
    const second = requestParentApproval({
      category: "Second",
      matched: "second rule",
      subject: "second command",
    })

    while (states.length < 2 || resolvers.length < 1) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    assert.deepEqual(states.map((state) => state.active), [true, true])

    resolvers[0](true)
    assert.deepEqual(await first, { approved: true })
    while (resolvers.length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    assert.deepEqual(states.map((state) => state.active), [true, true, false])

    resolvers[1](false)
    assert.deepEqual(await second, { approved: false })
    assert.deepEqual(states.map((state) => state.active), [true, true, false, false])
  } finally {
    await broker.close()
    if (originalSocket === undefined) delete process.env[SOCKET_ENV]
    else process.env[SOCKET_ENV] = originalSocket
    if (originalToken === undefined) delete process.env[TOKEN_ENV]
    else process.env[TOKEN_ENV] = originalToken
  }
})

test("clears pending approval state when the broker closes", async () => {
  const originalSocket = process.env[SOCKET_ENV]
  const originalToken = process.env[TOKEN_ENV]
  const states: Array<{ active: boolean; id: string; label: string }> = []
  const broker = await createApprovalBroker({ hasUI: true } as any, {
    requestApproval: () => new Promise<boolean>(() => {}),
    onApprovalStateChange: (state) => states.push(state),
  })
  process.env[SOCKET_ENV] = broker.env[SOCKET_ENV]
  process.env[TOKEN_ENV] = broker.env[TOKEN_ENV]

  const first = requestParentApproval({
    category: "First",
    matched: "first rule",
    subject: "first command",
  })
  const second = requestParentApproval({
    category: "Second",
    matched: "second rule",
    subject: "second command",
  })

  try {
    while (states.filter((state) => state.active).length < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    await broker.close()
    assert.deepEqual(states.map((state) => state.active), [true, true, false, false])
    assert.match((await first)?.error ?? "", /closed without a response|ECONNRESET/)
    assert.match((await second)?.error ?? "", /closed without a response|ECONNRESET/)
  } finally {
    if (originalSocket === undefined) delete process.env[SOCKET_ENV]
    else process.env[SOCKET_ENV] = originalSocket
    if (originalToken === undefined) delete process.env[TOKEN_ENV]
    else process.env[TOKEN_ENV] = originalToken
  }
})
