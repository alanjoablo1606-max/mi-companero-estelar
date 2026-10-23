import { describe, expect, it } from "vitest";
import { chatErrorMessage } from "@/lib/ai/chat-error";

describe("Chat failure classification", () => {
  it("preserves the gateway remedy for insufficient credits", () => {
    expect(chatErrorMessage({ statusCode: 402, responseBody: JSON.stringify({ message: "Añade créditos de IA para continuar." }) })).toBe("Añade créditos de IA para continuar.");
  });
  it("preserves an access denial rather than suggesting a connection retry", () => {
    expect(chatErrorMessage({ statusCode: 403, responseBody: JSON.stringify({ error: { message: "Acceso denegado por el proveedor." } }) })).toBe("Acceso denegado por el proveedor.");
  });
  it("recognizes a numeric credit failure without relying on the error title", () => {
    expect(chatErrorMessage({ statusCode: 402, message: "Payment Required" })).toContain("créditos de IA");
  });
});