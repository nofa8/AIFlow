module.exports = {
  // Base task structure sent to ai_tasks queue
  createTaskMessage: (taskId, type, input) => ({
    taskId,
    type,
    payload: { input },
    timestamp: new Date().toISOString()
  }),

  // Event structure sent to task_events queue
  createEventMessage: (taskId, status, data = null, error = null) => ({
    taskId,
    status,
    data,
    error,
    timestamp: new Date().toISOString()
  })
}
