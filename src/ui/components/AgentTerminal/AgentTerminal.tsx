import "./AgentTerminal.css";
import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

interface TerminalDimensions {
  cols: number;
  rows: number;
}

interface AgentTerminalProps {
  runId: string;
  output: string;
  onData: (data: string) => Promise<void>;
  onResize: (dimensions: TerminalDimensions) => Promise<void>;
}

export function AgentTerminal({
  runId,
  output,
  onData,
  onResize,
}: AgentTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const outputOffsetRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 11,
      scrollback: 1200,
      theme: {
        background: "#111111",
        foreground: "#f3f4f6",
        cursor: "#f3f4f6",
        selectionBackground: "#3b82f6",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminal.focus();
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    outputOffsetRef.current = 0;

    function fitAndReport() {
      try {
        fitAddon.fit();
        void onResize({
          cols: terminal.cols,
          rows: terminal.rows,
        });
      } catch (error) {
        console.error("[AgentTerminal] failed to resize terminal:", error);
      }
    }

    const dataDisposable = terminal.onData((data) => {
      onData(data).catch((error) => {
        console.error("[AgentTerminal] failed to send terminal data:", error);
      });
    });
    const resizeObserver = new ResizeObserver(fitAndReport);
    resizeObserver.observe(host);
    fitAndReport();

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      outputOffsetRef.current = 0;
    };
  }, [onData, onResize, runId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    if (output.length < outputOffsetRef.current) {
      terminal.clear();
      outputOffsetRef.current = 0;
    }

    const nextOutput = output.slice(outputOffsetRef.current);
    if (!nextOutput) {
      return;
    }

    terminal.write(nextOutput);
    outputOffsetRef.current = output.length;
  }, [output]);

  return (
    <div
      className="agent-terminal"
      role="log"
      aria-label="Agent terminal output"
    >
      <div className="agent-terminal__bar">
        <span>Terminal</span>
        <span>{runId}</span>
      </div>
      <div ref={hostRef} className="agent-terminal__screen" />
    </div>
  );
}
