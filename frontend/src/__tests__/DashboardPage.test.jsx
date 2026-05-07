import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';

// Mock hooks
vi.mock('../hooks/useDashboardData', () => ({
  useDashboardData: vi.fn(() => ({
    data: {
      hosts: [{ name: 'Host 1', cpuUsagePercent: 50 }],
      iloServers: [],
      vms: [],
    },
    status: { loading: false, ok: true, text: 'Normal' },
    lastUpdate: '2024-04-22 10:00:00',
  })),
}));

vi.mock('../hooks/useCardAnimation', () => ({
  useCardAnimation: vi.fn(() => null),
}));

// Mock components that might be problematic or not needed for basic render test
vi.mock('../components/ui/BackgroundAnimation', () => ({
  default: () => <div data-testid="bg-animation" />
}));

describe('DashboardPage', () => {
  it('renders the dashboard with data', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );
    
    expect(screen.getByText(/Last Update:/i)).toBeInTheDocument();
    expect(screen.getByText(/2024-04-22 10:00:00/i)).toBeInTheDocument();
    expect(screen.getByText(/Normal/i)).toBeInTheDocument();
  });
});
