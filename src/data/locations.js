// src/data/locations.js
export const COLOMBIA_DATA = [
  {
    city: "Bogotá",
    localities: [
      "Usaquén", "Chapinero", "Santa Fe", "San Cristóbal", "Usme",
      "Tunjuelito", "Bosa", "Kennedy", "Fontibón", "Engativá",
      "Suba", "Barrios Unidos", "Teusaquillo", "Los Mártires",
      "Antonio Nariño", "Puente Aranda", "La Candelaria",
      "Rafael Uribe Uribe", "Ciudad Bolívar", "Sumapaz"
    ]
  },
  {
    city: "Medellín",
    localities: ["El Poblado", "Laureles", "Belén", "Guayabal", "Aranjuez", "Robledo"]
  },
  {
    city: "Cali",
    localities: ["Comuna 1", "Comuna 2", "Comuna 17", "Comuna 22"]
  },
  {
    city: "Barranquilla",
    localities: ["Norte-Centro Histórico", "Riomar", "Sur Occidente", "Sur Oriente"]
  }
];

// ✅ Objeto listo para <select>
export const LOCATIONS = COLOMBIA_DATA.reduce((acc, item) => {
  acc[item.city] = item.localities || [];
  return acc;
}, {});