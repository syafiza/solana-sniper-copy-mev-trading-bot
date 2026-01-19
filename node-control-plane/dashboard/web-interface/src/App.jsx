import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, Loader2, Activity, ShieldAlert, Wallet } from 'lucide-react';
import axios from 'axios';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// --- Widget Components ---

const StatusCard = ({ data }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 shadow-lg w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-medium text-zinc-400">System Status</h3>
      <div className={`h-2 w-2 rounded-full ${data.status === 'running' ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
    </div>
    <div className="text-2xl font-bold text-white mb-1">{data.status.toUpperCase()}</div>
    <div className="text-xs text-zinc-500 font-mono">Uptime: {Math.floor(data.uptime)}s</div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="bg-zinc-800 p-2 rounded">
        <span className="block text-zinc-500">Version</span>
        <span className="font-mono">{data.version}</span>
      </div>
      <div className="bg-zinc-800 p-2 rounded">
        <span className="block text-zinc-500">Mode</span>
        <span className="font-mono text-emerald-400">Jito-Mev</span>
      </div>
    </div>
  </div>
);

const RiskGauge = ({ data }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 shadow-lg w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-2 mb-3">
      <ShieldAlert className="w-4 h-4 text-orange-400" />
      <h3 className="text-sm font-medium text-zinc-300">Risk Assessment</h3>
    </div>
    <div className="mb-2">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-500">Risk Level</span>
        <span className={`font-bold ${data.riskLevel === 'HIGH' ? 'text-red-500' : 'text-emerald-500'}`}>{data.riskLevel}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-1000 ${data.riskLevel === 'HIGH' ? 'bg-red-500' : 'bg-emerald-500'}`}
          style={{ width: `${data.score || 20}%` }}
        />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-2 mt-3">
      <div className="bg-zinc-950/50 p-2 rounded">
        <div className="text-[10px] text-zinc-500">Open Positions</div>
        <div className="text-lg font-mono">{data.openPositions}</div>
      </div>
      <div className="bg-zinc-950/50 p-2 rounded">
        <div className="text-[10px] text-zinc-500">Exposure</div>
        <div className="text-lg font-mono">{data.exposure} SOL</div>
      </div>
    </div>
  </div>
);

const PositionList = ({ positions }) => (
  <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 shadow-lg w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
    <div className="flex items-center gap-2 mb-3">
      <Wallet className="w-4 h-4 text-purple-400" />
      <h3 className="text-sm font-medium text-zinc-300">Active Positions ({positions.length})</h3>
    </div>
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
      {positions.map((pos, idx) => (
        <div key={idx} className="bg-zinc-800/50 p-3 rounded border border-zinc-700/50 hover:bg-zinc-800 transition-colors">
          <div className="flex justify-between items-start mb-1">
            <span className="text-xs font-mono text-zinc-300 truncate w-32" title={pos.mint}>{pos.mint}</span>
            <span className={`text-xs font-bold ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {pos.pnl >= 0 ? '+' : ''}{pos.pnl}%
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500">
            <span>Entry: {pos.entryPrice}</span>
            <span>Value: {pos.value} SOL</span>
          </div>
        </div>
      ))}
      {positions.length === 0 && (
        <div className="text-center py-4 text-zinc-600 text-xs italic">No active positions</div>
      )}
    </div>
  </div>
);

const Message = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] ${isUser ? 'order-2' : 'order-1'}`}>
        <div
          className={`p-3 rounded-2xl text-sm leading-relaxed ${isUser
              ? 'bg-blue-600 text-white rounded-br-none'
              : 'bg-zinc-800 text-zinc-100 rounded-bl-none border border-zinc-700'
            }`}
        >
          {msg.content}
        </div>
        {/* Render Widget if attached */}
        {msg.widget && (
          <div className="mt-2">
            {msg.widget.type === 'status' && <StatusCard data={msg.widget.data} />}
            {msg.widget.type === 'risk' && <RiskGauge data={msg.widget.data} />}
            {msg.widget.type === 'positions' && <PositionList positions={msg.widget.data} />}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Main Chat Interface ---

function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'bot',
      content: "I'm ready. System is online. Ask 'status', 'risk', or 'positions'."
    }
  ]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = { id: Date.now(), role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      // Simulate Generative Logic (In real app, this calls an LLM or Intent Classifier)
      // Here we map keywords to widgets for demonstration
      await new Promise(r => setTimeout(r, 600)); // Fake latency

      const lowerInput = userMsg.content.toLowerCase();
      let responseMsg = { id: Date.now() + 1, role: 'bot', content: "Command executed." };

      if (lowerInput.includes('status')) {
        // Fetch real status
        // const res = await axios.get('http://localhost:3000/api/status');
        const mockData = { status: 'running', uptime: 1234, version: '2.0.0' };
        responseMsg.content = "Here is the current system status.";
        responseMsg.widget = { type: 'status', data: mockData };
      }
      else if (lowerInput.includes('risk')) {
        const mockData = { riskLevel: 'LOW', score: 15, openPositions: 2, exposure: 0.5 };
        responseMsg.content = "Risk assessment generated.";
        responseMsg.widget = { type: 'risk', data: mockData };
      }
      else if (lowerInput.includes('position')) {
        const mockData = [
          { mint: 'So111...111', pnl: 12.5, entryPrice: 0.002, value: 0.5 },
          { mint: 'Bonk...Bonk', pnl: -2.3, entryPrice: 0.0001, value: 0.1 }
        ];
        responseMsg.content = `Found ${mockData.length} active positions.`;
        responseMsg.widget = { type: 'positions', data: mockData };
      }
      else {
        responseMsg.content = `I processed "${userMsg.content}" but no specific visualization was triggered. Try 'status', 'risk', or 'positions'.`;
      }

      setMessages(prev => [...prev, responseMsg]);

    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'bot', content: "Error processing command." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 font-sans text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 flex items-center px-6 bg-zinc-950/50 backdrop-blur">
        <Terminal className="w-5 h-5 text-emerald-500 mr-2" />
        <span className="font-bold tracking-tight">Solana Sniper Control</span>
        <span className="ml-auto text-xs px-2 py-1 bg-zinc-900 rounded border border-zinc-800 text-zinc-500 font-mono">
          v2.0.0 :: ONLINE
        </span>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="max-w-3xl mx-auto">
          {messages.map(m => (
            <Message key={m.id} msg={m} />
          ))}
          {loading && (
            <div className="flex mb-4">
              <div className="bg-zinc-800 p-3 rounded-2xl rounded-bl-none border border-zinc-700 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                <span className="text-xs text-zinc-400">Processing...</span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-4 border-t border-zinc-800 bg-zinc-950">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSend} className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a command (e.g., 'Check status', 'Risk report')..."
              className="w-full bg-zinc-900/50 border border-zinc-800 text-zinc-100 placeholder-zinc-600 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all shadow-lg"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-2 top-2 p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="text-center mt-2">
            <p className="text-[10px] text-zinc-600">
              AI-Powered Command Console. Transactions are irreversible.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
