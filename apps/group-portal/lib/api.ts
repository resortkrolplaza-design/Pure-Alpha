// =============================================================================
// Group Portal — API Base URL
// =============================================================================

import { Platform } from "react-native";

// Native apps don't have CORS -- call production directly.
// Web uses a local proxy to avoid CORS, but ONLY in dev mode.
export const API_BASE = __DEV__ && Platform.OS === "web"
  ? "http://localhost:3999"
  : "https://purealphahotel.pl";
