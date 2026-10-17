import {createPrivateKey,createPublicKey,sign,X509Certificate,type KeyObject} from "node:crypto";

export type QzSigningHealth={ready:boolean;code:string;message:string;fingerprint?:string;validTo?:string;trustMode?:string};
type Material={health:QzSigningHealth;certificate:string;key?:KeyObject};
// Never return private material, PEM parser errors or environment values to clients.
export function qzSigningMaterial(env:NodeJS.ProcessEnv=process.env,now=Date.now(),scope?:{brand:string;origin:string}):Material {
 const fail=(code:string,message:string):Material=>({health:{ready:false,code,message},certificate:""});
 if(!env.POS_QZ_CERTIFICATE||!env.POS_QZ_PRIVATE_KEY)return fail("QZ_SIGNER_MISSING","Faltan el certificado de firma y/o su clave privada en la configuración central de COMETA. Se requiere emisión QZ o una raíz administrada; instalar QZ no los crea.");
 try {
  const certificate=env.POS_QZ_CERTIFICATE.replaceAll("\\n","\n").trim();
  const cert=new X509Certificate(certificate);
  if(now<Date.parse(cert.validFrom))return fail("QZ_CERT_NOT_YET_VALID","El certificado de firma todavía no es vigente. Revisa la fecha del servidor o la emisión.");
  if(now>=Date.parse(cert.validTo))return fail("QZ_CERT_EXPIRED","El certificado de firma venció. Renueva y publica el certificado vigente antes de imprimir.");
  const key=createPrivateKey(env.POS_QZ_PRIVATE_KEY.replaceAll("\\n","\n"));
  if(key.asymmetricKeyType!=="rsa"||(key.asymmetricKeyDetails?.modulusLength??0)<2048)return fail("QZ_KEY_UNSUPPORTED","La firma QZ requiere una clave RSA de al menos 2048 bits.");
  if(!createPublicKey(key).equals(cert.publicKey))return fail("QZ_KEY_MISMATCH","El certificado y la clave privada de firma no corresponden. Corrige el par central sin cambiar la terminal.");
  const trustMode=env.POS_QZ_TRUST_MODE;
  if(trustMode!=="qz-issued"&&trustMode!=="managed-root")return fail("QZ_TRUST_MODE_REQUIRED","Declara centralmente POS_QZ_TRUST_MODE: qz-issued para certificado QZ, o managed-root con raíz instalada por administración en cada terminal.");
  if(trustMode==="managed-root" && (!env.POS_QZ_MANAGED_BRAND || !env.POS_QZ_MANAGED_ORIGIN || !scope || scope.brand!==env.POS_QZ_MANAGED_BRAND || scope.origin!==env.POS_QZ_MANAGED_ORIGIN))return fail("QZ_MANAGED_SCOPE_REQUIRED","La firma administrada no está habilitada para este negocio y origen. Revisa la configuración central de COMETA.");
  return {certificate,key,health:{ready:true,code:"QZ_SIGNER_VALID",fingerprint:cert.fingerprint256,validTo:cert.validTo,trustMode,message:`Firma central válida hasta ${cert.validTo}. ${trustMode==="managed-root"?"Requiere la raíz administrada instalada en esta terminal.":"QZ debe reconocer al emisor del certificado."} La confianza local y la salida física se comprueban en la terminal.`}};
 } catch {return fail("QZ_SIGNER_INVALID","El certificado o la clave central no tienen un formato PEM válido. Soporte debe revisar la configuración de firma; no se envió ninguna orden.");}
}
export function signQzDigest(material:Material,digest:string):string {
 if(!material.health.ready||!material.key)throw new Error(material.health.message);
 if(!/^[a-f0-9]{64}$/.test(digest))throw new Error("Digest QZ inválido.");
 return sign("SHA512",Buffer.from(digest),material.key).toString("base64");
}
