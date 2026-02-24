import { signOut } from "firebase/auth";
import { auth } from "./config"; // 👈 debe ser el mismo archivo que exporta auth

export const logoutUser = async () => {
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
