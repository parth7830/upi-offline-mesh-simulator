import React, { useState, useEffect } from 'react'

function App() {
  // Application State
  const [accounts, setAccounts] = useState([])
  const [transactions, setTransactions] = useState([])
  const [devices, setDevices] = useState([])
  const [idempotencyCacheSize, setIdempotencyCacheSize] = useState(0)
  
  // Form Inputs
  const [senderVpa, setSenderVpa] = useState('alice@demo')
  const [receiverVpa, setReceiverVpa] = useState('bob@demo')
  const [amount, setAmount] = useState('500')
  
  // UPI PIN Modal State
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinDigits, setPinDigits] = useState('')
  
  // Visual & Animation states
  const [isGossiping, setIsGossiping] = useState(false)
  const [isFlushing, setIsFlushing] = useState(false)
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), msg: "Simulator initialized. Ready to test offline mesh.", type: "system" }
  ])

  // Log Helper
  const addLog = (msg, type = "info") => {
    setLogs(prev => [
      { time: new Date().toLocaleTimeString(), msg, type },
      ...prev
    ])
  }

  // Fetch all backend state
  const refreshState = async () => {
    try {
      // Fetch Mesh state
      const meshRes = await fetch('/api/mesh/state')
      if (meshRes.ok) {
        const meshData = await meshRes.json()
        setDevices(meshData.devices || [])
        setIdempotencyCacheSize(meshData.idempotencyCacheSize || 0)
      }

      // Fetch Accounts
      const accountsRes = await fetch('/api/accounts')
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json()
        setAccounts(accountsData || [])
      }

      // Fetch Transactions
      const txRes = await fetch('/api/transactions')
      if (txRes.ok) {
        const txData = await txRes.json()
        setTransactions(txData || [])
      }
    } catch (err) {
      console.error("Error refreshing state:", err)
    }
  }

  // Run on mount, poll every 3.5 seconds
  useEffect(() => {
    refreshState()
    const timer = setInterval(refreshState, 3500)
    return () => clearInterval(timer)
  }, [])

  // Open PIN Pad Modal
  const handleOpenPinModal = (e) => {
    e.preventDefault()
    if (!senderVpa || !receiverVpa || !amount || parseFloat(amount) <= 0) {
      addLog("Invalid transaction details. Check input fields.", "error")
      return
    }
    if (senderVpa === receiverVpa) {
      addLog("Sender and receiver cannot be the same VPA.", "error")
      return
    }
    setPinDigits('')
    setShowPinModal(true)
  }

  // Keypad press handler
  const handleKeyPress = (key) => {
    if (key === 'delete') {
      setPinDigits(prev => prev.slice(0, -1))
    } else if (key === 'cancel') {
      setShowPinModal(false)
    } else {
      if (pinDigits.length < 4) {
        setPinDigits(prev => prev + key)
      }
    }
  }

  // Submit payment instruction creation
  const handlePinSubmit = async () => {
    if (pinDigits.length < 4) {
      addLog("Enter 4-digit PIN", "error")
      return
    }
    
    setShowPinModal(false)
    addLog(`Creating packet: ${senderVpa} -> ${receiverVpa} (₹${amount})`, "system")

    try {
      const body = {
        senderVpa,
        receiverVpa,
        amount: parseFloat(amount),
        pin: pinDigits,
        ttl: 5,
        startDevice: 'phone-alice'
      }

      const res = await fetch('/api/demo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (res.ok) {
        const data = await res.json()
        addLog(`📤 Packet encrypted successfully!`, "inject")
        addLog(`   ID: ${data.packetId.substring(0, 16)}...`, "inject")
        addLog(`   Ciphertext: ${data.ciphertextPreview}`, "inject")
        addLog(`   Injected at: ${data.injectedAt} (TTL: ${data.ttl})`, "inject")
        refreshState()
      } else {
        const errorText = await res.text()
        addLog(`Failed to inject packet: ${errorText}`, "error")
      }
    } catch (err) {
      addLog(`Network error during injection: ${err.message}`, "error")
    }
  }

  // Auto-submit when 4 digits are completed
  useEffect(() => {
    if (pinDigits.length === 4) {
      const timer = setTimeout(() => {
        handlePinSubmit()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [pinDigits])

  // Gossip Trigger
  const runGossip = async () => {
    setIsGossiping(true)
    addLog("Initiating Bluetooth gossip broadcast round...", "system")
    try {
      const res = await fetch('/api/mesh/gossip', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        addLog(`🔄 Gossip complete: ${data.transfers} packet transfers between devices.`, "gossip")
        Object.entries(data.deviceCounts).forEach(([dev, count]) => {
          addLog(`   ${dev} now holding ${count} packet(s)`, "gossip")
        })
        refreshState()
      } else {
        addLog("Gossip request failed.", "error")
      }
    } catch (err) {
      addLog(`Gossip error: ${err.message}`, "error")
    } finally {
      setTimeout(() => setIsGossiping(false), 1200)
    }
  }

  // Flush Trigger (bridge nodes connect to internet and upload)
  const runFlush = async () => {
    setIsFlushing(true)
    addLog("Simulating bridge nodes reaching 4G internet. Flush packets...", "system")
    try {
      const res = await fetch('/api/mesh/flush', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        addLog(`📡 Bridge uploaded ${data.uploadsAttempted} packet(s) to server:`, "flush")
        
        if (data.results && data.results.length > 0) {
          data.results.forEach(res => {
            const outcomeColor = res.outcome === 'SETTLED' ? '✅' : res.outcome === 'DUPLICATE_DROPPED' ? '🟡' : '❌'
            addLog(`   ${outcomeColor} [Bridge: ${res.bridgeNode}] Packet ${res.packetId} -> ${res.outcome} ${res.reason ? '('+res.reason+')' : ''}`, "flush")
          })
        } else {
          addLog("   No packets were held by bridge devices to upload.", "flush")
        }
        refreshState()
      } else {
        addLog("Flush request failed.", "error")
      }
    } catch (err) {
      addLog(`Flush error: ${err.message}`, "error")
    } finally {
      setTimeout(() => setIsFlushing(false), 1200)
    }
  }

  // Reset Trigger
  const runReset = async () => {
    if (window.confirm("Are you sure you want to clear the mesh network storage and the server idempotency cache?")) {
      addLog("Clearing mesh network and server idempotency caches...", "system")
      try {
        const res = await fetch('/api/mesh/reset', { method: 'POST' })
        if (res.ok) {
          addLog("🗑 Mesh state and idempotency cache cleared successfully.", "system")
          refreshState()
        } else {
          addLog("Reset request failed.", "error")
        }
      } catch (err) {
        addLog(`Reset error: ${err.message}`, "error")
      }
    }
  }

  // Helper icons as SVG components
  const AntennaIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16Z"/>
      <path d="M17 18h.01"/><path d="M12 18h.01"/><path d="M7 18h.01"/>
      <path d="M12 14h.01"/><path d="M7 14h.01"/><path d="M17 14h.01"/>
      <path d="M12 10h.01"/><path d="M7 10h.01"/><path d="M17 10h.01"/>
      <path d="M12 6h.01"/><path d="M7 6h.01"/><path d="M17 6h.01"/>
    </svg>
  )

  const PhoneIcon = ({ online }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={online ? "#4ade80" : "#9ca3af"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
      <line x1="12" y1="18" x2="12.01" y2="18"/>
    </svg>
  )

  return (
    <>
      <div className="bg-ambient">
        <div className="orb-1"></div>
        <div className="orb-2"></div>
        <div className="orb-3"></div>
      </div>
      
      <div className="app-container">
        {/* Header */}
        <header>
          <div>
            <h1>
              <AntennaIcon />
              UPI Offline Mesh Simulator
            </h1>
            <p>Secure peer-to-peer digital transactions in zero-connectivity environments via Bluetooth Mesh routing.</p>
          </div>
          <div className="info-pill">
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }}></span>
            Server Connected (8080)
          </div>
        </header>

        {/* Top Section - Device visual graph */}
        <section className="glass-panel">
          <div className="section-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            Bluetooth Gossip Mesh Topology Map
          </div>
          
          <div className="device-graph">
            <div className="device-graph-connections"></div>
            
            {devices.map(d => {
              const isBridge = d.hasInternet
              const isNodeGossiping = isGossiping && !isBridge
              const isNodeFlushing = isFlushing && isBridge
              
              return (
                <div 
                  key={d.deviceId} 
                  className={`device-node ${isBridge ? 'online' : 'offline'} ${isNodeGossiping ? 'active-gossip' : ''} ${isNodeFlushing ? 'active-flush' : ''}`}
                >
                  <div className="device-icon-container">
                    <PhoneIcon online={isBridge} />
                  </div>
                  <div className="device-name">{d.deviceId}</div>
                  <div className={`device-status ${isBridge ? 'online' : 'offline'}`}>
                    {isBridge ? '🌐 4G Bridge' : '🚫 Offline'}
                  </div>
                  <div className="device-packets-count">
                    Holding: <strong>{d.packetCount}</strong> {d.packetCount === 1 ? 'packet' : 'packets'}
                  </div>
                  <div className="device-packets">
                    {d.packetIds && d.packetIds.map((id, index) => (
                      <span key={index} className="packet-tag" title={id}>
                        {id}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Middle Section - Form Composer & Controls */}
        <div className="main-grid">
          <div className="flex-col">
            {/* Create Payment Panel */}
            <section className="glass-panel flex-grow">
              <div className="section-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                Send Money (Offline Client Phone)
              </div>
              
              <form onSubmit={handleOpenPinModal}>
                <div className="composer-row">
                  <div>
                    <label>Sender Account (Offline)</label>
                    <select 
                      value={senderVpa} 
                      onChange={e => setSenderVpa(e.target.value)}
                      style={{ width: '160px' }}
                    >
                      {accounts.map(a => (
                        <option key={a.vpa} value={a.vpa}>{a.holderName} ({a.vpa})</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: '1.2rem', marginTop: '20px', color: 'var(--text-muted)' }}>➔</div>

                  <div>
                    <label>Receiver VPA</label>
                    <select 
                      value={receiverVpa} 
                      onChange={e => setReceiverVpa(e.target.value)}
                      style={{ width: '160px' }}
                    >
                      {accounts.map(a => (
                        <option key={a.vpa} value={a.vpa}>{a.holderName} ({a.vpa})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Amount (₹)</label>
                    <input 
                      type="number" 
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      min="1"
                      style={{ width: '100px' }}
                    />
                  </div>

                  <div style={{ marginTop: '20px' }}>
                    <button type="submit" className="primary">
                      📤 Inject Payment Packet
                    </button>
                  </div>
                </div>
              </form>
              
              <div className="mt-4" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                💡 <strong>How it works:</strong> The sender's phone encrypts the payment details (VPA, amount, signature, nonce) using the server's public key. The packet can only be decrypted by the bank server. We inject this packet into <code>phone-alice</code>'s offline local store.
              </div>
            </section>
          </div>

          {/* Simulator control pad */}
          <section className="glass-panel flex-col">
            <div className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              Mesh Network Controls
            </div>
            
            <div className="flex-col" style={{ gap: '14px', height: '100%', justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  onClick={runGossip} 
                  disabled={isGossiping} 
                  className="secondary flex-grow"
                  style={{ padding: '14px 20px' }}
                >
                  {isGossiping ? '🔄 Gossiping...' : '🔄 Run Gossip Hop'}
                </button>

                <button 
                  onClick={runFlush} 
                  disabled={isFlushing} 
                  className="primary flex-grow"
                  style={{ padding: '14px 20px' }}
                >
                  {isFlushing ? '📡 Uploading...' : '📡 Bridge Flush (4G)'}
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="info-pill" style={{ fontFamily: 'var(--font-mono)' }}>
                  Idempotency Lock Size: {idempotencyCacheSize}
                </span>

                <button onClick={runReset} className="danger">
                  🗑 Reset Simulator
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Bottom Section - Balances, Log & Transactions */}
        <div className="dashboard-grid">
          {/* Balances Card */}
          <section className="glass-panel balances-card">
            <div className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              Core Accounts (Bank Ledger)
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Holder</th>
                    <th>VPA</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.vpa}>
                      <td><strong>{a.holderName}</strong></td>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{a.vpa}</td>
                      <td className="balance-cell text-right">₹{parseFloat(a.balance).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Activity Logs */}
          <section className="glass-panel simulator-controls">
            <div className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 22V4c0-.5.2-1 .6-1.4C5 2.2 5.5 2 6 2h12c.5 0 1 .2 1.4.6.4.4.6.9.6 1.4v18l-4-2-4 2-4-2-4 2Z"/><path d="M12 6H8.01"/><path d="M12 10H8.01"/><path d="M12 14H8.01"/><path d="M16 6h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/></svg>
              Simulated Activity Terminal
            </div>
            <div className="console-log">
              {logs.map((log, index) => (
                <div key={index} className="console-line">
                  <span className="console-time">[{log.time}]</span>
                  <span className={`console-text ${log.type}`}>
                    {log.msg}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Transaction Ledger */}
          <section className="glass-panel transaction-card">
            <div className="section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Real-time Settlement Ledger
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Sender</th>
                    <th>Receiver</th>
                    <th className="text-right">Amount</th>
                    <th>Status</th>
                    <th>Bridge Node</th>
                    <th>Hops</th>
                    <th className="text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>
                        No settled transactions recorded on the backend.
                      </td>
                    </tr>
                  ) : (
                    transactions.map(tx => (
                      <tr key={tx.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>#{tx.id}</td>
                        <td>{tx.senderVpa}</td>
                        <td>{tx.receiverVpa}</td>
                        <td className="balance-cell text-right" style={{ color: tx.status === 'SETTLED' ? 'var(--text-green)' : 'var(--text-red)' }}>
                          ₹{parseFloat(tx.amount).toFixed(2)}
                        </td>
                        <td>
                          <span className={`status-badge ${tx.status.toLowerCase() === 'duplicate_dropped' ? 'duplicate' : tx.status.toLowerCase()}`}>
                            {tx.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{tx.bridgeNodeId}</td>
                        <td style={{ textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{tx.hopCount}</td>
                        <td className="text-right" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(tx.settledAt).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer>
          <div>
            Design Theme: <strong>Glassmorphism Pro</strong>
          </div>
          <div>
            Powered by React + Spring Boot • Offline UPI via Bluetooth Mesh
          </div>
        </footer>
      </div>

      {/* Secure UPI PIN Keypad Modal Overlay */}
      {showPinModal && (
        <div className="pin-overlay">
          <div className="pin-modal">
            <div className="pin-header">ENTER 4-DIGIT UPI PIN</div>
            <div className="pin-subheader">Secured by Hybrid RSA-2048 Encryption</div>
            
            <div className="pin-dots">
              <div className={`pin-dot ${pinDigits.length >= 1 ? 'filled' : ''}`}></div>
              <div className={`pin-dot ${pinDigits.length >= 2 ? 'filled' : ''}`}></div>
              <div className={`pin-dot ${pinDigits.length >= 3 ? 'filled' : ''}`}></div>
              <div className={`pin-dot ${pinDigits.length >= 4 ? 'filled' : ''}`}></div>
            </div>
            
            <div className="pin-keypad">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button 
                  key={num} 
                  type="button" 
                  className="pin-key"
                  onClick={() => handleKeyPress(num)}
                >
                  {num}
                </button>
              ))}
              
              <button 
                type="button" 
                className="pin-key action-key"
                onClick={() => handleKeyPress('cancel')}
              >
                Cancel
              </button>
              
              <button 
                type="button" 
                className="pin-key"
                onClick={() => handleKeyPress(0)}
              >
                0
              </button>
              
              <button 
                type="button" 
                className="pin-key action-key submit-key"
                style={{ fontSize: '1.2rem' }}
                onClick={() => handleKeyPress('delete')}
              >
                ⌫
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default App
