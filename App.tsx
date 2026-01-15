import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, Legend 
} from 'recharts';
import * as d3 from 'd3';
import yaml from 'js-yaml';

import { PAINTER_STYLES, SAMPLE_CSV, TRANSLATIONS, DEFAULT_AGENTS_YAML, MODEL_OPTIONS } from './constants';
import { parseCSV, aggregateData, filterData } from './services/dataService';
import { generateResponse } from './services/geminiService';
import { PackingListItem, PainterStyle, Language, AppTab, ChatMessage, UsageLog, AgentDef, DataFilters } from './types';

// Icons
const IconMenu = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
const IconUpload = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>;
const IconSparkles = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
const IconTable = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>;
const IconFilter = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>;

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<AppTab>('analytics');
  const [data, setData] = useState<PackingListItem[]>([]);
  
  // Filtering
  const [filters, setFilters] = useState<DataFilters>({ supplier: '', device: '', startDate: '', endDate: '' });
  const [showPreview, setShowPreview] = useState(false);

  // Styling & Config
  const [theme, setTheme] = useState<PainterStyle>(PAINTER_STYLES[0]);
  const [isDark, setIsDark] = useState(false);
  const [lang, setLang] = useState<Language>('en');
  const [isJackpotSpinning, setIsJackpotSpinning] = useState(false);
  const [logs, setLogs] = useState<UsageLog[]>([]);

  // Agents
  const [agentsYaml, setAgentsYaml] = useState(DEFAULT_AGENTS_YAML);
  const [parsedAgents, setParsedAgents] = useState<AgentDef[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview');

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // --- Derived State ---
  const t = TRANSLATIONS[lang];
  
  // Filter Data
  const filteredData = useMemo(() => filterData(data, filters), [data, filters]);
  const analytics = useMemo(() => aggregateData(filteredData), [filteredData]);
  
  const currentAgent = parsedAgents.find(a => a.id === selectedAgentId) || parsedAgents[0];

  // Unique options for filters
  const uniqueSuppliers = useMemo(() => Array.from(new Set(data.map(d => d.Suppliername))).sort(), [data]);
  const uniqueDevices = useMemo(() => Array.from(new Set(data.map(d => d.DeviceName))).sort(), [data]);

  // --- Effects ---
  useEffect(() => {
    try {
      const doc = yaml.load(agentsYaml) as any;
      if (doc && doc.agents) {
        const agentsList: AgentDef[] = Object.entries(doc.agents).map(([key, val]: [string, any]) => ({
          id: key,
          name: key.replace(/_/g, ' ').toUpperCase(),
          description: val.description,
          llm_provider: val.llm_provider,
          model: val.model,
          capabilities: val.capabilities || [],
          system_prompt: val.system_prompt
        }));
        setParsedAgents(agentsList);
        if (agentsList.length > 0 && !selectedAgentId) {
            setSelectedAgentId(agentsList[0].id);
        }
      }
    } catch (e) {
      console.error("Failed to parse agents YAML", e);
    }
  }, [agentsYaml]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--painter-primary', theme.colors.primary);
    root.style.setProperty('--painter-secondary', theme.colors.secondary);
    root.style.setProperty('--painter-accent', theme.colors.accent);
    root.style.setProperty('--painter-bg', isDark ? '#1a1a1a' : theme.colors.bg);
    root.style.setProperty('--painter-text', isDark ? '#f0f0f0' : theme.colors.text);
    root.style.setProperty('--painter-card', isDark ? '#2d2d2d' : theme.colors.card);
    
    if (isDark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme, isDark]);

  useEffect(() => {
    handleLoadSample();
  }, []);

  // --- Handlers ---

  const logEvent = (event: string, details: string) => {
    setLogs(prev => [{ timestamp: Date.now(), event, details }, ...prev]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        const parsed = parseCSV(text);
        setData(parsed);
        logEvent('Data Upload', `Uploaded ${file.name}, ${parsed.length} rows`);
      };
      reader.readAsText(file);
    }
  };

  const handleLoadSample = () => {
    const parsed = parseCSV(SAMPLE_CSV);
    setData(parsed);
    logEvent('Data Load', 'Loaded Sample Data');
  };

  const handleSpinJackpot = () => {
    setIsJackpotSpinning(true);
    let spins = 0;
    const interval = setInterval(() => {
      const randomIdx = Math.floor(Math.random() * PAINTER_STYLES.length);
      setTheme(PAINTER_STYLES[randomIdx]);
      spins++;
      if (spins > 10) {
        clearInterval(interval);
        setIsJackpotSpinning(false);
        logEvent('Theme Change', `Spun to ${PAINTER_STYLES[randomIdx].name}`);
      }
    }, 100);
  };

  const handleAgentYamlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (evt) => {
              const text = evt.target?.result as string;
              setAgentsYaml(text);
              logEvent('Agent Config', 'Uploaded new agents.yaml');
          };
          reader.readAsText(file);
      }
  };

  const handleDownloadYaml = () => {
      const blob = new Blob([agentsYaml], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'agents.yaml';
      a.click();
      URL.revokeObjectURL(url);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !currentAgent) return;

    const userMsg: ChatMessage = { role: 'user', text: chatInput, timestamp: Date.now() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    const dataContext = `
      Current Data Snapshot (Filtered):
      Total Lines: ${analytics.totalLines}
      Total Units: ${analytics.totalUnits}
      Unique Suppliers: ${analytics.uniqueSuppliers}
      Top Device: ${analytics.topDevices[0]?.name || 'N/A'}
      Time Range: ${filters.startDate || 'Start'} to ${filters.endDate || 'End'}
      Filter Applied: Supplier=${filters.supplier || 'All'}, Device=${filters.device || 'All'}
    `;

    const fullPrompt = `
      ${currentAgent.system_prompt}
      
      DATA CONTEXT:
      ${dataContext}
      
      USER QUERY:
      ${userMsg.text}
    `;

    const responseText = await generateResponse(
      fullPrompt, 
      selectedModel,
      undefined, 
      0.7
    );

    const botMsg: ChatMessage = { 
      role: 'model', 
      text: responseText, 
      timestamp: Date.now(),
      agentId: currentAgent.id,
      modelUsed: selectedModel
    };

    setChatMessages(prev => [...prev, botMsg]);
    setIsChatLoading(false);
    logEvent('Agent Chat', `Used ${currentAgent.name} with ${selectedModel}`);
  };

  // --- Render Helpers ---

  const renderForceGraph = useCallback(() => {
    if (filteredData.length === 0) return null;
    const graphData = filteredData.slice(0, 100); 
    
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeSet = new Set<string>();

    graphData.forEach(d => {
      const sup = `SUP:${d.Suppliername}`;
      const dev = `DEV:${d.DeviceName}`;
      const cust = `CUST:${d.customer}`;

      if (!nodeSet.has(sup)) { nodes.push({ id: sup, group: 'supplier', label: d.Suppliername }); nodeSet.add(sup); }
      if (!nodeSet.has(dev)) { nodes.push({ id: dev, group: 'device', label: d.DeviceName }); nodeSet.add(dev); }
      if (!nodeSet.has(cust)) { nodes.push({ id: cust, group: 'customer', label: d.customer }); nodeSet.add(cust); }

      links.push({ source: sup, target: dev, value: 1 });
      links.push({ source: dev, target: cust, value: d.Numbers });
    });

    return <GraphComponent nodes={nodes} links={links} theme={theme} />;
  }, [filteredData, theme]);

  return (
    <div className={`flex h-screen bg-painter-bg text-painter-text font-sans transition-colors duration-500 overflow-hidden`}>
      
      {/* Sidebar */}
      <aside className="w-64 bg-painter-card shadow-xl flex flex-col z-20 border-r border-painter-primary/20">
        <div className="p-6 border-b border-painter-primary/10">
          <h1 className="text-xl font-bold text-painter-primary">{t.title}</h1>
          <p className="text-xs text-painter-secondary mt-1 opacity-80">{t.subtitle}</p>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {(['analytics', 'chat', 'hq', 'docs'] as AppTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-300 ${
                activeTab === tab 
                  ? 'bg-painter-primary text-white shadow-md translate-x-1' 
                  : 'hover:bg-painter-secondary/10 text-painter-text/80'
              }`}
            >
              <span className="capitalize">{t[tab]}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-painter-primary/10 space-y-4 bg-painter-bg/50">
          {/* Style Jackpot */}
          <div className="bg-painter-card rounded-xl p-3 shadow-inner border border-painter-secondary/20 text-center relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-painter-primary to-painter-accent opacity-50"></div>
            <h3 className="text-xs font-bold uppercase tracking-widest text-painter-secondary mb-2">{t.jackpot}</h3>
            <div className="text-sm font-medium mb-3 truncate">{theme.name}</div>
            <button 
              onClick={handleSpinJackpot}
              disabled={isJackpotSpinning}
              className="w-full bg-painter-accent hover:bg-painter-primary text-white font-bold py-2 px-4 rounded-full transition-all transform active:scale-95 flex justify-center items-center gap-2"
            >
              <IconSparkles />
              {isJackpotSpinning ? '...' : 'SPIN'}
            </button>
          </div>

          <div className="flex gap-2 justify-between">
             <button onClick={() => setIsDark(!isDark)} className="p-2 rounded bg-painter-card border border-painter-primary/20 hover:bg-painter-primary/10">
               {isDark ? '🌙' : '☀️'}
             </button>
             <button onClick={() => setLang(lang === 'en' ? 'zh' : 'en')} className="p-2 rounded bg-painter-card border border-painter-primary/20 hover:bg-painter-primary/10 font-bold text-xs">
               {lang === 'en' ? 'EN' : '中文'}
             </button>
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-center w-full px-4 py-2 bg-painter-card text-painter-text rounded-lg border border-dashed border-painter-primary/40 cursor-pointer hover:bg-painter-primary/5 transition-colors">
                <IconUpload />
                <span className="ml-2 text-sm">{t.upload}</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".csv" />
            </label>
            <button onClick={handleLoadSample} className="w-full text-xs text-painter-secondary underline hover:text-painter-primary">
              {t.useSample}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative p-8">
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none z-0"
          style={{ background: `linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.bg})` }}
        ></div>

        <div className="relative z-10 max-w-7xl mx-auto">
          
          {/* Header & Filters */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
             <div>
                <h2 className="text-3xl font-bold text-painter-primary drop-shadow-sm">{t[activeTab]}</h2>
                <div className="text-sm text-painter-secondary mt-1">
                    {filteredData.length} / {data.length} records • {theme.name} Style
                </div>
             </div>
             
             {activeTab === 'analytics' && (
                <div className="flex flex-wrap gap-2 bg-painter-card p-3 rounded-xl shadow-lg border border-painter-primary/10">
                    <select 
                        className="bg-painter-bg border border-painter-secondary/30 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-painter-accent max-w-[150px]"
                        value={filters.supplier}
                        onChange={e => setFilters({...filters, supplier: e.target.value})}
                    >
                        <option value="">All Suppliers</option>
                        {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    
                    <select 
                        className="bg-painter-bg border border-painter-secondary/30 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-painter-accent max-w-[150px]"
                        value={filters.device}
                        onChange={e => setFilters({...filters, device: e.target.value})}
                    >
                        <option value="">All Devices</option>
                        {uniqueDevices.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    <input 
                        type="date" 
                        className="bg-painter-bg border border-painter-secondary/30 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-painter-accent"
                        value={filters.startDate}
                        onChange={e => setFilters({...filters, startDate: e.target.value})}
                    />
                     <span className="self-center text-painter-secondary">-</span>
                    <input 
                        type="date" 
                        className="bg-painter-bg border border-painter-secondary/30 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-painter-accent"
                        value={filters.endDate}
                        onChange={e => setFilters({...filters, endDate: e.target.value})}
                    />

                    <button 
                        onClick={() => setShowPreview(!showPreview)}
                        className={`p-2 rounded-lg transition-colors border ${showPreview ? 'bg-painter-accent text-white' : 'bg-painter-bg hover:bg-painter-primary/10'}`}
                        title={t.dataPreview}
                    >
                        <IconTable />
                    </button>
                </div>
             )}
          </div>

          {activeTab === 'analytics' && (
            <div className="space-y-8 animate-fade-in">
              
              {/* Data Preview Table */}
              {showPreview && (
                  <div className="bg-painter-card rounded-2xl shadow-lg border border-painter-primary/5 overflow-hidden animate-slide-down">
                      <div className="p-4 border-b border-painter-primary/10 flex justify-between items-center bg-painter-bg/30">
                          <h3 className="font-bold text-painter-primary">{t.dataPreview}</h3>
                          <span className="text-xs opacity-60">Showing first 50 filtered rows</span>
                      </div>
                      <div className="overflow-x-auto">
                          <table className="w-full text-sm text-left">
                              <thead className="text-xs uppercase bg-painter-secondary/10 text-painter-secondary">
                                  <tr>
                                      {['Suppliername', 'deliverdate', 'customer', 'DeviceName', 'Numbers', 'ModelNum'].map(h => (
                                          <th key={h} className="px-6 py-3">{h}</th>
                                      ))}
                                  </tr>
                              </thead>
                              <tbody>
                                  {filteredData.slice(0, 50).map((row, i) => (
                                      <tr key={i} className="border-b border-painter-secondary/5 hover:bg-painter-primary/5">
                                          <td className="px-6 py-2 font-medium">{row.Suppliername}</td>
                                          <td className="px-6 py-2">{row.deliverdate}</td>
                                          <td className="px-6 py-2">{row.customer}</td>
                                          <td className="px-6 py-2">{row.DeviceName}</td>
                                          <td className="px-6 py-2">{row.Numbers}</td>
                                          <td className="px-6 py-2">{row.ModelNum}</td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      </div>
                  </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: t.totalLines, val: analytics.totalLines },
                  { label: t.totalUnits, val: analytics.totalUnits.toLocaleString() },
                  { label: t.uniqueSuppliers, val: analytics.uniqueSuppliers },
                  { label: t.uniqueCustomers, val: analytics.uniqueCustomers }
                ].map((stat, i) => (
                  <div key={i} className="bg-painter-card p-6 rounded-2xl shadow-lg border-l-4 border-painter-accent transform hover:-translate-y-1 transition-transform">
                    <p className="text-painter-secondary text-sm font-semibold uppercase">{stat.label}</p>
                    <p className="text-3xl font-bold text-painter-text mt-2">{stat.val}</p>
                  </div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-painter-card p-6 rounded-2xl shadow-lg border border-painter-primary/5">
                  <h3 className="text-lg font-bold mb-4 text-painter-primary">{t.timeSeries}</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.timeSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme.colors.secondary} opacity={0.2} />
                        <XAxis dataKey="date" stroke={theme.colors.text} tick={{fontSize: 12}} />
                        <YAxis stroke={theme.colors.text} tick={{fontSize: 12}} />
                        <RechartsTooltip contentStyle={{backgroundColor: theme.colors.card, borderColor: theme.colors.primary}} />
                        <Line type="monotone" dataKey="value" stroke={theme.colors.primary} strokeWidth={3} dot={{fill: theme.colors.accent}} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                
                <div className="bg-painter-card p-6 rounded-2xl shadow-lg border border-painter-primary/5">
                  <h3 className="text-lg font-bold mb-4 text-painter-primary">{t.topDevices}</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics.topDevices} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme.colors.secondary} opacity={0.2} />
                        <XAxis type="number" stroke={theme.colors.text} />
                        <YAxis dataKey="name" type="category" width={150} stroke={theme.colors.text} tick={{fontSize: 10}} />
                        <RechartsTooltip contentStyle={{backgroundColor: theme.colors.card}} />
                        <Bar dataKey="value" fill={theme.colors.accent} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Graph */}
              <div className="bg-painter-card p-6 rounded-2xl shadow-lg border border-painter-primary/5">
                <h3 className="text-lg font-bold mb-4 text-painter-primary">{t.graph}</h3>
                <div className="h-[500px] w-full bg-painter-bg/30 rounded-lg overflow-hidden relative">
                   {renderForceGraph()}
                </div>
              </div>

            </div>
          )}

          {activeTab === 'chat' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-160px)]">
               {/* Agent List */}
               <div className="bg-painter-card rounded-2xl shadow-lg p-4 overflow-y-auto border border-painter-primary/10 flex flex-col">
                 <h3 className="font-bold text-painter-primary mb-2">Select Agent</h3>
                 
                 {/* Model Selection */}
                 <div className="mb-4">
                    <label className="text-xs text-painter-secondary uppercase font-semibold mb-1 block">{t.modelSelection}</label>
                    <select 
                        className="w-full bg-painter-bg border border-painter-secondary/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-painter-accent"
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                    >
                        {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                 </div>

                 <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                   {parsedAgents.map(agent => (
                     <div 
                        key={agent.id}
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${
                          selectedAgentId === agent.id 
                            ? 'bg-painter-primary text-white border-painter-primary' 
                            : 'bg-painter-bg hover:bg-painter-secondary/10 border-painter-secondary/20'
                        }`}
                     >
                       <div className="font-bold text-sm">{agent.name}</div>
                       <div className="text-xs opacity-80 mt-1 line-clamp-2">{agent.description}</div>
                     </div>
                   ))}
                 </div>
               </div>

               {/* Chat Area */}
               <div className="lg:col-span-2 bg-painter-card rounded-2xl shadow-lg flex flex-col border border-painter-primary/10 overflow-hidden">
                  <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-painter-bg/5">
                    {chatMessages.length === 0 && (
                      <div className="text-center text-painter-secondary mt-20 opacity-50">
                        <IconSparkles />
                        <p className="mt-2">Start a conversation with {currentAgent?.name}</p>
                        <p className="text-xs">Context aware of filtered dataset ({filteredData.length} rows)</p>
                      </div>
                    )}
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                          msg.role === 'user' 
                            ? 'bg-painter-primary text-white rounded-br-none' 
                            : 'bg-painter-bg text-painter-text border border-painter-secondary/20 rounded-bl-none'
                        }`}>
                          <div className="text-xs opacity-70 mb-1 flex justify-between gap-4">
                             <div className="flex gap-2">
                                <span>{msg.role === 'model' ? currentAgent?.name : 'You'}</span>
                                {msg.modelUsed && <span className="opacity-50 text-[10px] bg-black/10 px-1 rounded">{msg.modelUsed}</span>}
                             </div>
                             <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{msg.text}</div>
                        </div>
                      </div>
                    ))}
                    {isChatLoading && (
                      <div className="flex justify-start">
                         <div className="bg-painter-bg p-4 rounded-2xl rounded-bl-none border border-painter-secondary/20 animate-pulse">
                           {t.analyzing}
                         </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 bg-painter-card border-t border-painter-primary/10">
                    <div className="flex gap-2">
                      <input 
                        className="flex-1 bg-painter-bg border border-painter-secondary/30 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-painter-accent"
                        placeholder="Type your query..."
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      />
                      <button 
                        onClick={handleSendMessage}
                        disabled={isChatLoading}
                        className="bg-painter-accent hover:bg-painter-primary text-white rounded-full p-3 transition-colors shadow-md disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                      </button>
                    </div>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'hq' && (
             <div className="bg-painter-card rounded-2xl shadow-lg p-8 border border-painter-primary/10 animate-fade-in">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-painter-primary">{t.hq}</h3>
                    <div className="flex gap-2">
                        <label className="bg-painter-secondary/10 hover:bg-painter-secondary/20 text-painter-text px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm flex items-center gap-2">
                            <IconUpload /> {t.uploadYaml}
                            <input type="file" className="hidden" accept=".yaml,.yml" onChange={handleAgentYamlUpload} />
                        </label>
                        <button onClick={handleDownloadYaml} className="bg-painter-primary hover:bg-painter-accent text-white px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            {t.downloadYaml}
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h4 className="font-bold text-lg mb-2">Edit agents.yaml</h4>
                        <p className="text-xs text-painter-secondary mb-2">Modify the definitions below to add or change agent behaviors.</p>
                        <textarea 
                            className="w-full h-96 bg-painter-bg font-mono text-xs border border-painter-secondary/30 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-painter-accent"
                            value={agentsYaml}
                            onChange={(e) => setAgentsYaml(e.target.value)}
                        />
                        <button className="mt-2 bg-painter-accent text-white px-4 py-2 rounded-lg text-sm shadow-md hover:bg-painter-primary transition-colors">
                            {t.saveYaml}
                        </button>
                    </div>

                    <div>
                         <h4 className="font-bold text-lg mb-2">System Logs</h4>
                        <div className="bg-painter-bg p-4 rounded-lg font-mono text-xs h-96 overflow-y-auto border border-painter-secondary/20 shadow-inner">
                            {logs.length === 0 && <span className="opacity-50">No logs yet.</span>}
                            {logs.map((log, i) => (
                            <div key={i} className="mb-2 border-b border-painter-secondary/10 pb-1">
                                <span className="text-painter-accent mr-2">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                                <span className="font-bold text-painter-primary mr-2">{log.event}:</span>
                                <span className="opacity-80">{log.details}</span>
                            </div>
                            ))}
                        </div>
                    </div>
                </div>
             </div>
          )}

          {activeTab === 'docs' && (
             <div className="bg-painter-card rounded-2xl shadow-lg p-8 border border-painter-primary/10 animate-fade-in">
                <h3 className="text-2xl font-bold text-painter-primary mb-6">Documentation</h3>
                <div className="space-y-6 text-painter-text">
                   <div className="p-6 bg-painter-bg rounded-xl border border-painter-secondary/20">
                     <h4 className="font-bold text-lg mb-2 text-painter-accent">Overview</h4>
                     <p>GUDID Chronicles allows for deep inspection of medical device supply chains. Use the Analytics tab for visual insights and the Chat tab to converse with specialized AI agents.</p>
                   </div>
                   <div className="p-6 bg-painter-bg rounded-xl border border-painter-secondary/20">
                     <h4 className="font-bold text-lg mb-2 text-painter-accent">Advanced Filtering</h4>
                     <p>You can now filter the entire dataset by Supplier, Device, and Date Range directly in the Analytics tab. These filters apply to all charts, the graph, and the AI agent context.</p>
                   </div>
                   <div className="p-6 bg-painter-bg rounded-xl border border-painter-secondary/20">
                     <h4 className="font-bold text-lg mb-2 text-painter-accent">Agent Headquarters</h4>
                     <p>Go to the Agent HQ tab to upload your own `agents.yaml` configuration or edit the existing one live. You can define custom system prompts, capabilities, and preferred models.</p>
                   </div>
                </div>
             </div>
          )}

        </div>
      </main>
    </div>
  );
}

const GraphComponent = ({ nodes, links, theme }: { nodes: any[], links: any[], theme: PainterStyle }) => {
  const svgRef = React.useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const width = svgRef.current.clientWidth;
    const height = 500;

    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
        .attr("viewBox", [0, 0, width, height]);

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id((d: any) => d.id).distance(100))
        .force("charge", d3.forceManyBody().strength(-300))
        .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
        .attr("stroke", theme.colors.secondary)
        .attr("stroke-opacity", 0.6)
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke-width", (d: any) => Math.sqrt(d.value || 1));

    const node = svg.append("g")
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.5)
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", 8)
        .attr("fill", (d: any) => {
            if (d.group === 'supplier') return theme.colors.primary; 
            if (d.group === 'device') return theme.colors.accent; 
            return theme.colors.secondary;
        })
        .call(drag(simulation) as any);

    node.append("title")
        .text((d: any) => d.label);
    
    const labels = svg.append("g")
        .selectAll("text")
        .data(nodes)
        .join("text")
        .text((d: any) => d.label.length > 10 ? d.label.substring(0,10)+'...' : d.label)
        .attr("x", 12)
        .attr("y", 4)
        .style("font-size", "10px")
        .style("fill", theme.colors.text)
        .style("pointer-events", "none");

    simulation.on("tick", () => {
        link
            .attr("x1", (d: any) => d.source.x)
            .attr("y1", (d: any) => d.source.y)
            .attr("x2", (d: any) => d.target.x)
            .attr("y2", (d: any) => d.target.y);

        node
            .attr("cx", (d: any) => d.x)
            .attr("cy", (d: any) => d.y);
            
        labels
            .attr("x", (d: any) => d.x + 12)
            .attr("y", (d: any) => d.y + 4);
    });

    function drag(simulation: any) {
        function dragstarted(event: any) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            event.subject.fx = event.subject.x;
            event.subject.fy = event.subject.y;
        }

        function dragged(event: any) {
            event.subject.fx = event.x;
            event.subject.fy = event.y;
        }

        function dragended(event: any) {
            if (!event.active) simulation.alphaTarget(0);
            event.subject.fx = null;
            event.subject.fy = null;
        }

        return d3.drag()
            .on("start", dragstarted)
            .on("drag", dragged)
            .on("end", dragended);
    }

  }, [nodes, links, theme]);

  return <svg ref={svgRef} className="w-full h-full" />;
};