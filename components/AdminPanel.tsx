import React, { useState, useEffect } from 'react';
import { getDatabaseEntries, addDatabaseEntry, deleteDatabaseEntry, resetDatabase, DatabaseEntry } from '../services/mockRagService';

export const AdminPanel: React.FC = () => {
    const [entries, setEntries] = useState<DatabaseEntry[]>([]);
    const [category, setCategory] = useState<DatabaseEntry['category']>('Policy');
    const [keywords, setKeywords] = useState('');
    const [content, setContent] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        refreshEntries();
    }, []);

    const refreshEntries = () => {
        setEntries(getDatabaseEntries());
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!keywords.trim() || !content.trim()) return;

        addDatabaseEntry(
            category,
            keywords.split(',').map(s => s.trim()),
            content
        );

        setKeywords('');
        setContent('');
        refreshEntries();
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
    };

    const handleDelete = (id: string) => {
        if (confirm("Are you sure you want to delete this knowledge entry?")) {
            deleteDatabaseEntry(id);
            refreshEntries();
        }
    };

    const handleReset = () => {
        if (confirm("RESET DATABASE? This will remove all custom entries.")) {
            resetDatabase();
            refreshEntries();
        }
    };

    return (
        <div className="flex-1 flex gap-6 p-6 overflow-hidden bg-[#0a0a00]">
            {/* Background Decor for Admin Mode */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-amber-900/20 via-black to-black pointer-events-none"></div>

            {/* Left Column: Input Form */}
            <div className="w-96 flex flex-col gap-6 relative z-10">
                <div className="p-6 rounded-xl bg-zinc-900/80 border border-amber-500/20 backdrop-blur-md shadow-2xl">
                    <h2 className="text-lg font-bold text-amber-500 mb-1 flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Inject Knowledge
                    </h2>
                    <p className="text-xs text-zinc-500 mb-6 font-mono">ROOT_ACCESS_GRANTED: Add new vector contexts.</p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Category</label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['Policy', 'Order', 'Info', 'Tech'] as const).map((cat) => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setCategory(cat)}
                                        className={`px-3 py-2 rounded text-xs font-mono border transition-colors ${
                                            category === cat 
                                            ? 'bg-amber-500 text-black border-amber-500 font-bold' 
                                            : 'bg-black/40 text-zinc-400 border-zinc-700 hover:border-zinc-500'
                                        }`}
                                    >
                                        {cat.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Trigger Keywords</label>
                            <input 
                                type="text" 
                                value={keywords}
                                onChange={(e) => setKeywords(e.target.value)}
                                placeholder="e.g. refund, return, money back"
                                className="w-full bg-black/40 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-amber-100 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 font-mono"
                            />
                            <p className="text-[10px] text-zinc-600 mt-1">Comma separated. Match user intent.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Knowledge Content</label>
                            <textarea 
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="POLICY_REFUND: Users can return items within..."
                                rows={6}
                                className="w-full bg-black/40 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-amber-500/50 font-mono resize-none leading-relaxed"
                            />
                        </div>

                        <button 
                            type="submit" 
                            className="w-full py-3 bg-gradient-to-r from-amber-600 to-yellow-600 text-black font-bold rounded-lg shadow-lg shadow-amber-900/20 hover:from-amber-500 hover:to-yellow-500 transition-all flex justify-center items-center gap-2"
                        >
                            {isSaved ? 'DATALINK ESTABLISHED' : 'UPLOAD TO VECTOR DB'}
                        </button>
                    </form>
                </div>

                <div className="p-4 rounded-xl border border-red-900/30 bg-red-950/10">
                    <h3 className="text-xs font-bold text-red-500 mb-2 uppercase">Danger Zone</h3>
                    <button 
                        onClick={handleReset}
                        className="text-xs text-red-400 hover:text-red-300 underline font-mono"
                    >
                        &gt; RESET_ALL_DATA_TO_FACTORY_DEFAULT
                    </button>
                </div>
            </div>

            {/* Right Column: List View */}
            <div className="flex-1 flex flex-col rounded-xl bg-zinc-900/50 border border-white/10 backdrop-blur-sm relative overflow-hidden z-10">
                <div className="px-6 py-4 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h2 className="text-sm font-bold text-zinc-300 uppercase tracking-widest">Active Knowledge Index</h2>
                    <span className="font-mono text-xs text-amber-500">{entries.length} RECORDS FOUND</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {entries.map((entry) => (
                        <div key={entry.id} className="group p-4 rounded-lg bg-black/40 border border-white/5 hover:border-amber-500/30 transition-all">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                        entry.category === 'Policy' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' :
                                        entry.category === 'Order' ? 'bg-purple-900/30 text-purple-400 border border-purple-800' :
                                        entry.category === 'Tech' ? 'bg-red-900/30 text-red-400 border border-red-800' :
                                        'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                    }`}>
                                        {entry.category}
                                    </span>
                                    <span className="text-xs text-zinc-500 font-mono">ID: {entry.id}</span>
                                </div>
                                <button 
                                    onClick={() => handleDelete(entry.id)}
                                    className="text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                            <div className="mb-2">
                                <span className="text-xs font-mono text-zinc-500 mr-2">&gt; MATCH_KEYS:</span>
                                {entry.keywords.map(k => (
                                    <span key={k} className="inline-block text-[10px] text-amber-500/80 bg-amber-900/10 px-1.5 py-0.5 rounded border border-amber-900/20 mr-1 mb-1">
                                        {k}
                                    </span>
                                ))}
                            </div>
                            <p className="text-sm text-zinc-300 bg-zinc-900/50 p-3 rounded font-mono border border-white/5">
                                {entry.content}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};