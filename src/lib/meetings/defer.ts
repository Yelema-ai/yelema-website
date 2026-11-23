export type Defer = (task: () => Promise<void>) => void;
