declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*?worker&inline" {
  const value: new () => Worker;
  export default value;
}

declare module "*?raw" {
  const content: string;
  export default content;
}
