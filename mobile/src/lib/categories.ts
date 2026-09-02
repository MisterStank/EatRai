export type Category = { key: string; label: string };

// key must match the backend's categoryTypes map (internal/places/places.go).
export const CATEGORIES: Category[] = [
  { key: "thai", label: "Thai" },
  { key: "isaan", label: "Isaan / Northeastern" },
  { key: "noodles", label: "Noodles" },
  { key: "street", label: "Street food" },
  { key: "seafood", label: "Seafood" },
  { key: "japanese", label: "Japanese" },
  { key: "cafe", label: "Café" },
  { key: "bar", label: "Bar" },
  { key: "bbq", label: "Grill / BBQ" },
  { key: "dessert", label: "Dessert" },
  { key: "vegetarian", label: "Vegetarian" },
  { key: "chinese", label: "Chinese" },
  { key: "pizza", label: "Pizza" },
  { key: "burgers", label: "Burgers" },
];

export const RADII: { m: number; label: string }[] = [
  { m: 500, label: "500 m" },
  { m: 1000, label: "1 km" },
  { m: 2000, label: "2 km" },
  { m: 5000, label: "5 km" },
];
