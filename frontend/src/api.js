
const API_URL = "https://studymate-ai-backend-uwsu.onrender.com";
const TOKEN_KEY = "studymate_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const isForm = options.body instanceof FormData;

  const headers = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null
        ? data.detail || data.message || "Something went wrong."
        : data || "Something went wrong.";

    throw new Error(message);
  }

  return data;
}

// AUTH
export async function registerUser(name, email, password) {
  const data = await apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });

  saveToken(data.access_token);
  return data.user;
}

export async function loginUser(email, password) {
  const data = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  saveToken(data.access_token);
  return data.user;
}

export async function getCurrentUser() {
  const data = await apiRequest("/auth/me");
  return data.user;
}

export function logoutUser() {
  clearToken();
}

// MATERIALS
export async function getMaterials() {
  const data = await apiRequest("/materials");
  return data.materials || [];
}

export async function getMaterial(materialId) {
  return apiRequest(`/materials/${materialId}`);
}

export async function uploadMaterial(file) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest("/upload", {
    method: "POST",
    body: formData,
  });
}

export async function deleteMaterial(materialId) {
  return apiRequest(`/materials/${materialId}`, {
    method: "DELETE",
  });
}

// AI TOOLS
export async function generateSummary(material) {
  return apiRequest("/summarize", {
    method: "POST",
    body: JSON.stringify({
      filename: material.filename,
      text: material.text,
      material_id: Number(material.id),
      style: "exam",
    }),
  });
}

export async function generateQuiz(material, count) {
  return apiRequest("/quiz", {
    method: "POST",
    body: JSON.stringify({
      filename: material.filename,
      text: material.text,
      material_id: Number(material.id),
      num_questions: Number(count),
    }),
  });
}

export async function generateFlashcards(material, count) {
  return apiRequest("/flashcards", {
    method: "POST",
    body: JSON.stringify({
      filename: material.filename,
      text: material.text,
      material_id: Number(material.id),
      num_cards: Number(count),
    }),
  });
}

// SAVED CONTENT
export async function getStudyContent() {
  return apiRequest("/study-content");
}