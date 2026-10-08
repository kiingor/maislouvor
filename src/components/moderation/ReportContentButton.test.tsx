import { describe, it, beforeEach, afterEach, vi, expect } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ReportContentButton } from "./ReportContentButton";
const mock = vi.hoisted(() => ({ rpc:vi.fn(),toast:vi.fn() }));
vi.mock("@/lib/songCatalog",()=>({songRpc:mock.rpc}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:mock.toast})}));
beforeEach(()=>mock.rpc.mockResolvedValue("report-id"));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("content report submission",()=>{
 it("uses the backend reason code for a music copyright report",async()=>{
  render(<ReportContentButton songId="song-1"/>);fireEvent.click(screen.getByText("Denunciar música"));
  expect(screen.getByLabelText("Motivo")).toHaveValue("copyright");
  fireEvent.change(screen.getByLabelText("Detalhes (opcional)"),{target:{value:"Gravação sem autorização"}});
  fireEvent.click(screen.getByText("Enviar denúncia"));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("report_content",{p_kind:"song",p_song_id:"song-1",p_reason:"copyright",p_details:"Gravação sem autorização",p_evidence:""}));
 });
 it("requires the AI response when no generated response was supplied",async()=>{
  render(<ReportContentButton/>);fireEvent.click(screen.getByText("Denunciar resposta de IA"));
  expect(screen.getByText("Enviar denúncia")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Resposta recebida"),{target:{value:"Resposta ofensiva"}});
  fireEvent.change(screen.getByLabelText("Motivo"),{target:{value:"offensive"}});
  fireEvent.click(screen.getByText("Enviar denúncia"));
  await waitFor(()=>expect(mock.rpc).toHaveBeenCalledWith("report_content",expect.objectContaining({p_reason:"offensive",p_kind:"ai",p_evidence:"Resposta ofensiva"})));
 });
});
