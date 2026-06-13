import { createFileRoute } from "@tanstack/react-router";
import App from "@/App.jsx";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "GoodLife FHR Generator" },
      { name: "description", content: "Recommendation Report Studio for GoodLife Financial Planning advisors." },
    ],
  }),
  component: () => <App />,
});