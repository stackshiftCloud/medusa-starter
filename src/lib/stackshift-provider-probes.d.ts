import type { StackShiftMedusaObserver } from "@stackshift-cloud/medusa-observe";
type Environment = Record<string, string | undefined>;
type Probe = {
    name: string;
    check: () => Promise<void>;
};
export declare function startStackShiftProviderProbes(observer: StackShiftMedusaObserver, environment: Environment, intervalMs?: number): Promise<() => void>;
export declare function stackshiftProviderProbes(environment: Environment): Probe[];
export {};
