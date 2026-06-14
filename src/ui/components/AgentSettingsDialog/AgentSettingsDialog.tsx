import "./AgentSettingsDialog.css";
import { useEffect, useState } from "react";
import {
  clearDesktopAgentConfig,
  detectDesktopAgentClis,
  getDesktopAgentConfig,
  saveDesktopAgentConfig,
  testDesktopAgentCommand,
} from "../../../runtime";
import type {
  AgentCliDetection,
  AgentCommandTestResult,
  AgentConfig,
} from "../../../runtime";
import { useAppStore } from "../../../store";

const EMPTY_DETECTIONS: AgentCliDetection[] = [];
const EMPTY_CONFIG: AgentConfig = {
  command: null,
  source: null,
};

function configSourceLabel(config: AgentConfig): string {
  if (config.source === "config") {
    return "Saved in Dragon";
  }
  if (config.source === "environment") {
    return "From DRAGON_AGENT_COMMAND";
  }
  return "Not configured";
}

function detectionStatus(detection: AgentCliDetection): string {
  if (!detection.available) {
    return "Not found";
  }
  return detection.path ?? "Found on PATH";
}

function testResultLabel(result: AgentCommandTestResult): string {
  if (result.output.trim()) {
    return `${result.message}: ${result.output.trim()}`;
  }
  return result.message;
}

export function AgentSettingsDialog() {
  const closeAgentSettings = useAppStore((state) => state.closeAgentSettings);
  const showToast = useAppStore((state) => state.showToast);
  const [config, setConfig] = useState<AgentConfig>(EMPTY_CONFIG);
  const [detections, setDetections] =
    useState<AgentCliDetection[]>(EMPTY_DETECTIONS);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<AgentCommandTestResult | null>(
    null,
  );

  async function reloadSettings() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [nextConfig, nextDetections] = await Promise.all([
        getDesktopAgentConfig(),
        detectDesktopAgentClis(),
      ]);
      setConfig(nextConfig);
      setCommand(nextConfig.command ?? "");
      setDetections(nextDetections);
    } catch (error) {
      console.error(
        "[AgentSettingsDialog] failed to load agent settings:",
        error,
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Agent settings failed to load.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      setErrorMessage("Agent command cannot be empty.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    try {
      await saveDesktopAgentConfig(trimmedCommand);
      const nextConfig = await getDesktopAgentConfig();
      setConfig(nextConfig);
      setCommand(nextConfig.command ?? trimmedCommand);
      showToast("Agent command saved");
      closeAgentSettings();
    } catch (error) {
      console.error(
        "[AgentSettingsDialog] failed to save agent settings:",
        error,
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Agent command failed to save.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    setSaving(true);
    setErrorMessage(null);
    try {
      await clearDesktopAgentConfig();
      const nextConfig = await getDesktopAgentConfig();
      setConfig(nextConfig);
      setCommand(nextConfig.command ?? "");
      setTestResult(null);
      showToast("Agent command cleared");
    } catch (error) {
      console.error(
        "[AgentSettingsDialog] failed to clear agent settings:",
        error,
      );
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Agent command failed to clear.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      setErrorMessage("Agent command cannot be empty.");
      return;
    }

    setTesting(true);
    setErrorMessage(null);
    setTestResult(null);
    try {
      const result = await testDesktopAgentCommand(trimmedCommand);
      setTestResult(result);
    } catch (error) {
      console.error(
        "[AgentSettingsDialog] failed to test agent command:",
        error,
      );
      setErrorMessage(
        error instanceof Error ? error.message : "Agent command test failed.",
      );
    } finally {
      setTesting(false);
    }
  }

  useEffect(() => {
    void reloadSettings();
  }, []);

  return (
    <div className="agent-settings" role="dialog" aria-modal="true">
      <div className="agent-settings__backdrop" onClick={closeAgentSettings} />
      <section
        className="agent-settings__panel"
        aria-labelledby="agent-settings-title"
      >
        <header className="agent-settings__header">
          <div>
            <h2 id="agent-settings-title">Desktop agent</h2>
            <p>{configSourceLabel(config)}</p>
          </div>
          <button
            className="agent-settings__close"
            onClick={closeAgentSettings}
            aria-label="Close agent settings"
          >
            x
          </button>
        </header>

        {loading ? (
          <p className="agent-settings__status">Loading agent settings...</p>
        ) : (
          <>
            <div className="agent-settings__field">
              <label htmlFor="agent-command">Command</label>
              <input
                id="agent-command"
                value={command}
                onChange={(event) => {
                  setCommand(event.target.value);
                  setTestResult(null);
                }}
                placeholder="codex"
              />
            </div>

            <div className="agent-settings__detections">
              <span className="agent-settings__section-title">
                Detected CLIs
              </span>
              {detections.map((detection) => (
                <div className="agent-settings__detection" key={detection.id}>
                  <div className="agent-settings__detection-copy">
                    <strong>{detection.label}</strong>
                    <span>{detectionStatus(detection)}</span>
                    {detection.version && <code>{detection.version}</code>}
                  </div>
                  <button
                    className="agent-settings__secondary"
                    onClick={() => {
                      setCommand(detection.command);
                      setTestResult(null);
                    }}
                    disabled={!detection.available}
                  >
                    Use
                  </button>
                </div>
              ))}
            </div>

            {errorMessage && (
              <div className="agent-settings__error" role="alert">
                {errorMessage}
              </div>
            )}

            {testResult && (
              <div
                className={
                  testResult.ok
                    ? "agent-settings__test agent-settings__test--ok"
                    : "agent-settings__test agent-settings__test--failed"
                }
                role="status"
              >
                {testResultLabel(testResult)}
              </div>
            )}

            <footer className="agent-settings__actions">
              <button
                className="agent-settings__secondary"
                onClick={() => {
                  void handleClear();
                }}
                disabled={saving}
              >
                Clear
              </button>
              <button
                className="agent-settings__secondary"
                onClick={() => {
                  void handleTest();
                }}
                disabled={testing || saving}
              >
                {testing ? "Testing..." : "Test"}
              </button>
              <button
                className="agent-settings__primary"
                onClick={() => {
                  void handleSave();
                }}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
