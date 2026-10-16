declare module "qz-tray" {
  const qz:{printers:{find():Promise<string[]>};api:{setSha256Type(hasher:(message:string)=>Promise<string>):void};security:{setCertificatePromise(callback:(resolve:(certificate:string)=>void,reject:(reason:unknown)=>void)=>void):void;setSignatureAlgorithm(value:string):void;setSignaturePromise(callback:(message:string)=>(resolve:(signature:string)=>void,reject:(reason:unknown)=>void)=>void):void};websocket:{isActive():boolean;connect(options:{host:string;usingSecure:boolean}):Promise<void>};configs:{create(printer:string,options:Record<string,unknown>):unknown};print(config:unknown,data:unknown[]):Promise<void>};
  export default qz;
}
