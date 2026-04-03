import type { FlowState, KioskConfig } from './types';

export const kioskConfig: KioskConfig = {
  idleMs: 30_000,
  countdownSeconds: 5,
  printingMs: 4_000,
};

const manualFlowStates: FlowState[] = ['consent', 'camera', 'review', 'cameraError'];

export function resetsOnIdle(flowState: FlowState) {
  return manualFlowStates.includes(flowState);
}
