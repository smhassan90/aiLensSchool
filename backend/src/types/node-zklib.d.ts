declare module 'node-zklib' {
  export default class ZKLib {
    constructor(ip: string, port: number, timeout: number);
    createSocket(): Promise<void>;
    disconnect(): Promise<void>;
    getUsers(): Promise<Array<Record<string, unknown>>>;
    getAttendances(): Promise<Array<Record<string, unknown>>>;
    getSerialNumber?(): Promise<string>;
  }
}
