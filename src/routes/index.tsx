import { createFileRoute } from "@tanstack/react-router";
import { PlantWorld } from "@/components/plant-world";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <PlantWorld />;
}
