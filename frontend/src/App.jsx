import { useState, useEffect, useRef, useCallback } from 'react'

const API_BASE = '/api'
const WS_URL = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`

export default function App() {
  const [tasks, setTasks] = useState([])
  const [input, setInput] = useState('')
  const [type, setType] = useState('sentiment')
  const [file, setFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [toasts, setToasts] = useState([])
  const wsRef = useRef(null)
  const toastId = useRef(0)

  const isImageTask = type === 'gemini-image'
  const isPdfTask = type === 'gemini-pdf'
  const requiresFile = isImageTask || isPdfTask

  // ─── Toast helper ─────────────────────────────────────────
  const addToast = useCallback((message, error = false) => {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, message, error }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  // ─── Fetch tasks ──────────────────────────────────────────
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks`)
      if (res.ok) {
        const data = await res.json()
        setTasks(data)
      }
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
    }
  }, [])

  // ─── WebSocket ────────────────────────────────────────────
  useEffect(() => {
    let ws
    let reconnectTimer

    function connect() {
      ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        console.log('[WS] Connected')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'task_update') {
          // Re-fetch to get full updated data
          fetchTasks()
          addToast(`Task ${data.taskId.slice(0, 8)}… → ${data.status}`, data.status === 'failed')
        }
      }

      ws.onclose = () => {
        setWsStatus('disconnected')
        console.log('[WS] Disconnected — reconnecting in 3s')
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    connect()
    return () => { clearTimeout(reconnectTimer); ws?.close() }
  }, [fetchTasks, addToast])

  // ─── Initial load ─────────────────────────────────────────
  useEffect(() => { fetchTasks() }, [fetchTasks])

  // ─── Submit task ──────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!input.trim()) return

    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('input', input.trim())
      if (file) formData.append('file', file)

      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const task = await res.json()
        setTasks(prev => [task, ...prev])
        setInput('')
        setFile(null)
        addToast(`Task ${task.id.slice(0, 8)}… queued`)
      } else {
        const err = await res.json()
        addToast(err.error || 'Failed to create task', true)
      }
    } catch (err) {
      addToast('Network error', true)
    } finally {
      setSubmitting(false)
    }
  }

  // Add this function above your return()
  const handleTypeChange = (e) => {
    setType(e.target.value)
    setFile(null) // Wipe the file if they change the task type
    // We clear the file input element visually
    if (document.getElementById('task-file')) {
      document.getElementById('task-file').value = ''
    }
  }

  // ─── Visual Result Renderer ─────────────────────────────────
  const renderTaskResult = (task) => {
    // 1. Real-time Loading States
    if (task.status === 'pending') {
      return (
        <div className="status-indicator waiting">
          <span className="spinner-small"></span> Waiting for worker...
        </div>
      )
    }
    
    if (task.status === 'processing') {
      return (
        <div className="status-indicator processing">
          <span className="pulse-dot"></span> 🤖 AI is analyzing...
        </div>
      )
    }

    if (task.status === 'failed') {
      return <div className="error-text">❌ {task.result?.error || 'Task failed to process.'}</div>
    }

    // 2. Beautiful Result Parsing
    const data = task.result?.data || task.result;
    if (!data) return null;

    switch (task.type) {
      case 'sentiment':
      case 'hf-sentiment':
        const isPositive = data.label?.toLowerCase() === 'positive';
        const scorePct = Math.round((data.score || 0) * 100);
        return (
          <div className="result-sentiment">
            <span className={`sentiment-badge ${isPositive ? 'positive' : 'negative'}`}>
              {data.label?.toUpperCase()}
            </span>
            <div className="confidence-bar-bg">
              <div 
                className={`confidence-bar-fill ${isPositive ? 'bg-green' : 'bg-red'}`} 
                style={{ width: `${scorePct}%` }}
              ></div>
            </div>
            <small>{scorePct}% Confidence</small>
          </div>
        );

      case 'keywords':
        return (
          <div className="result-keywords">
            {data.keywords?.map((kw, i) => (
              <span key={i} className="keyword-tag">
                {kw.word} <span className="kw-count">{kw.count}</span>
              </span>
            ))}
          </div>
        );

      case 'gemini-image':
      case 'gemini-pdf':
      case 'gemini-chat':
      case 'summarize':
        return (
          <div className="result-text-block">
            <p>{data.text || data.summary || data.response}</p>
          </div>
        );

      default:
        // Safe fallback for anything unexpected
        return <pre>{JSON.stringify(data, null, 2)}</pre>;
    }
  }

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <h1>⚡ AIFlow</h1>
        <p>Cloud-native AI task processing platform</p>
        <div className={`connection-badge ${wsStatus}`}>
          <span className="dot" />
          {wsStatus === 'connected' ? 'Realtime Connected' : 'Reconnecting…'}
        </div>
      </header>

      {/* Create Task */}
      <section className="create-task">
        <h2>New Task</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <select value={type} onChange={handleTypeChange} id="task-type-select">
              <optgroup label="Simulated (Mocks)">
                <option value="sentiment">Mock Sentiment</option>
                <option value="summarize">Mock Summary</option>
                <option value="keywords">Mock Keywords</option>
              </optgroup>
              <optgroup label="Real AI APIs">
                <option value="hf-sentiment">Real Sentiment (HuggingFace)</option>
                <option value="gemini-chat">AI Chat (Gemini)</option>
                <option value="gemini-image">Image Caption (Gemini)</option>
                <option value="gemini-pdf">PDF Summary (Gemini)</option>
              </optgroup>
            </select>
            <textarea
              id="task-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={requiresFile ? "Optional instructions (e.g., 'Extract names')..." : "Enter text to analyze…"}
              rows={2}
            />
          </div>
          <div className="form-row">
            {requiresFile ? (
              <div className="file-input-wrapper">
                <input
                  id="task-file"
                  type="file"
                  accept={isImageTask ? "image/*" : "application/pdf"}
                  onChange={e => setFile(e.target.files[0] || null)}
                />
                <small style={{display: 'block', marginTop: '4px', color: '#888'}}>Max size: 5MB</small>
              </div>
            ) : (
              <div className="spacer"></div> /* Empty div to keep flexbox layout aligned */
            )}
            
            <button 
              className="btn-submit" 
              type="submit" 
              disabled={submitting || (requiresFile ? !file : !input.trim())} 
              id="submit-task-btn"
            >
              {submitting ? 'Submitting…' : 'Submit Task'}
            </button>
          </div>
        </form>
      </section>

      {/* Task List */}
      <section>
        <div className="tasks-header">
          <h2>Tasks</h2>
          <span className="task-count">{tasks.length} total</span>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="icon">📭</div>
            <p>No tasks yet — submit one above to get started.</p>
          </div>
        ) : (
          <div className="tasks-list">
            {tasks.map(task => (
              <article className={`task-card ${task.status}`} key={task.id}>
                <div className="task-card-top">
                  <span className="task-type">
                    {task.type === 'gemini-image' ? '🖼️ Image AI' : 
                     task.type === 'gemini-pdf' ? '📄 PDF AI' : 
                     task.type.includes('sentiment') ? '🎭 Sentiment' : 
                     '💬 Text AI'}
                  </span>
                  <span className={`task-status ${task.status}`}>{task.status}</span>
                </div>
                
                <div className="task-input">
                  {task.type.includes('gemini') && task.input === '' 
                    ? <em>No text provided, only file analyzed.</em> 
                    : task.input}
                </div>

                {/* --- NEW DYNAMIC RESULT AREA --- */}
                <div className={`task-result-area ${task.status}`}>
                  {task.result?.provider && task.status === 'completed' && (
                    <div className="provider-wrapper">
                      <span className={`provider-badge ${task.result.provider}`}>
                        {task.result.provider === 'mock-fallback' ? '⚠️ FALLBACK' : task.result.provider}
                      </span>
                    </div>
                  )}
                  
                  <div className="parsed-result">
                    {renderTaskResult(task)}
                  </div>
                </div>
                {/* ------------------------------- */}

                <div className="task-meta">
                  {task.id.slice(0, 8)}… · {new Date(task.created_at).toLocaleString()}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
