// src/firebase/authService.js
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./config";

export const registerUser = async (email, password, extraData = {}) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // ✅ Nombre real en Auth (para que displayName exista)
    if (extraData?.nombre) {
      await updateProfile(user, { displayName: extraData.nombre });
    }

    // ✅ Colección consistente con App.jsx (usuarios)
    await setDoc(doc(db, "usuarios", user.uid), {
      uid: user.uid,
      email: user.email,
      nombre: extraData?.nombre || "",
      ...extraData,
      createdAt: serverTimestamp(),
    });

    return { success: true, user };
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return {
      success: false,
      errorCode: error?.code || "unknown",
      error: error?.message || String(error),
    };
  }
};
