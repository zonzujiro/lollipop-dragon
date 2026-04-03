import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect } from 'vitest';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { setTestState, resetTestStore, makeShare } from './testHelpers';

beforeEach(() => {
  resetTestStore();
});

describe('ConnectionStatus — peer mode', () => {
  it('renders "Connected" when rtStatus is connected in peer mode', () => {
    setTestState({}, { isPeerMode: true, rtStatus: 'connected' });
    render(<ConnectionStatus />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders "Connecting..." when rtStatus is connecting in peer mode', () => {
    setTestState({}, { isPeerMode: true, rtStatus: 'connecting' });
    render(<ConnectionStatus />);
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
  });

  it('renders "Offline" when rtStatus is disconnected in peer mode', () => {
    setTestState({}, { isPeerMode: true, rtStatus: 'disconnected' });
    render(<ConnectionStatus />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('sets data-status attribute from rtStatus', () => {
    setTestState({}, { isPeerMode: true, rtStatus: 'connected' });
    render(<ConnectionStatus />);
    const statusEl = screen.getByText('Connected').closest('.connection-status');
    expect(statusEl).toHaveAttribute('data-status', 'connected');
  });
});

describe('ConnectionStatus — host mode with active shares', () => {
  it('renders when active tab has a non-expired share', () => {
    const activeShare = makeShare({ expiresAt: new Date(Date.now() + 86400000).toISOString() });
    setTestState({ shares: [activeShare] }, { isPeerMode: false, rtStatus: 'connected' });
    render(<ConnectionStatus />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('does not render when active tab only has expired shares', () => {
    const expiredShare = makeShare({ expiresAt: new Date(Date.now() - 86400000).toISOString() });
    setTestState({ shares: [expiredShare] }, { isPeerMode: false, rtStatus: 'connected' });
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ConnectionStatus — hidden when not relevant', () => {
  it('returns null when not in peer mode and no active shares', () => {
    setTestState({ shares: [] }, { isPeerMode: false, rtStatus: 'connected' });
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when not in peer mode and no active tab', () => {
    resetTestStore();
    const { container } = render(<ConnectionStatus />);
    expect(container.firstChild).toBeNull();
  });
});
