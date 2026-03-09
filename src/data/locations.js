// src/data/locations.js

// ✅ Para activar más ciudades, agrégalas aquí:
// ["Bogotá", "Medellín", "Cali", "Barranquilla"]
export const ACTIVE_CITIES = ["Bogotá"];

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

// ✅ Solo ciudades activas (filtradas por ACTIVE_CITIES)
export const ACTIVE_COLOMBIA_DATA = COLOMBIA_DATA.filter((c) =>
  ACTIVE_CITIES.includes(c.city)
);

// ✅ Objeto listo para <select>
export const LOCATIONS = ACTIVE_COLOMBIA_DATA.reduce((acc, item) => {
  acc[item.city] = item.localities || [];
  return acc;
}, {});