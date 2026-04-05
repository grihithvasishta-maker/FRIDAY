import React, { useState } from 'react';
import { Play, Code, X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface CodePreviewProps {
  code: string;
  language?: string;
}

export function CodePreview({ code, language }: CodePreviewProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const isHtml = language === 'html' || code.trim().startsWith('<!DOCTYPE html>') || code.trim().startsWith('<html');

  if (!isHtml) {
    return (
      <pre className="bg-black/40 p-4 rounded-xl border border-white/10 overflow-x-auto">
        <code className="text-xs font-mono text-cyan-100/80">{code}</code>
      </pre>
    );
  }

  return (
    <div className="group relative my-4">
      <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-t-xl px-4 py-2">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] uppercase tracking-widest font-mono text-white/40">Source Code</span>
        </div>
        <button
          onClick={() => setIsPreviewOpen(true)}
          className="flex items-center gap-2 px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-all active:scale-95"
        >
          <Play className="w-3 h-3 fill-current" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Live Preview</span>
        </button>
      </div>
      
      <pre className="bg-black/40 p-4 rounded-b-xl border-x border-b border-white/10 overflow-x-auto max-h-[300px]">
        <code className="text-xs font-mono text-cyan-100/80">{code}</code>
      </pre>

      {isPreviewOpen && (
        <div className={cn(
          "fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 backdrop-blur-xl bg-black/60 transition-all duration-500",
          isExpanded ? "p-0" : "p-4 md:p-10"
        )}>
          <div className={cn(
            "bg-[#0a0a0a] border border-white/10 shadow-2xl flex flex-col transition-all duration-500 overflow-hidden",
            isExpanded ? "w-full h-full rounded-none" : "w-full max-w-5xl h-[80vh] rounded-3xl"
          )}>
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/40">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/50" />
                </div>
                <span className="text-xs font-mono text-white/40 uppercase tracking-widest">FRIDAY Sandbox</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-2 rounded-xl hover:bg-white/5 text-white/40 transition-colors"
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setIsPreviewOpen(false)}
                  className="p-2 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-white">
              <iframe
                srcDoc={code}
                title="Preview"
                className="w-full h-full border-none"
                sandbox="allow-scripts"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
