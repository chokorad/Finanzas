// ============================================================
//  CONFIGURACIÓN de Finanzas
// ============================================================

// 1) Proyecto de Firebase. Por ahora comparte el proyecto de Cobros (plan gratuito Spark);
//    los datos viven en colecciones propias "finanzas_*", no se mezclan con Cobros.
//    Para usar otro proyecto, reemplaza este objeto con el de Consola -> Configuración -> Tus apps.
export const firebaseConfig = {
  apiKey: "AIzaSyCwp-hOdkS0CrNLYSjc2_CuNml4BNFTtSU",
  authDomain: "cobros-97f8b.firebaseapp.com",
  projectId: "cobros-97f8b",
  storageBucket: "cobros-97f8b.firebasestorage.app",
  messagingSenderId: "860344570793",
  appId: "1:860344570793:web:639a8707c6198533d36ab8"
};

// 2) Solo estos correos pueden entrar. Pon el mismo correo en firestore.rules.
export const CORREOS_PERMITIDOS = ["mariohquintero@gmail.com"];
