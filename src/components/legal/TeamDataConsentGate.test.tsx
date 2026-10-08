import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TeamDataConsentGate } from "./TeamDataConsentGate";
const mocks=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),mounted:vi.fn()}));
vi.mock("@/lib/teamDataConsent",()=>({readTeamDataConsent:mocks.read,saveTeamDataConsent:mocks.save,teamDataConsentKey:(id:string)=>["consent",id]}));
const allowed={allowed:true,version:"2026-10-08",accepted_at:"2026-10-08"};
function Protected(){mocks.mounted();return <p>Dados da equipe</p>;}
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter><TeamDataConsentGate userId="qa"><Protected/></TeamDataConsentGate></MemoryRouter></QueryClientProvider>);}
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.read.mockResolvedValue({...allowed,allowed:false});mocks.save.mockResolvedValue(allowed);});
describe("individual consent",()=>{
 it("does not mount private data or precheck consent, saves only explicit choice",async()=>{mount();const box=await screen.findByRole("checkbox");expect(box).not.toBeChecked();expect(mocks.mounted).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"Autorizar e continuar"})).toBeDisabled();fireEvent.click(box);fireEvent.click(screen.getByRole("button",{name:"Autorizar e continuar"}));await screen.findByText("Dados da equipe");expect(mocks.save).toHaveBeenCalledWith(true);});
 it("fails closed when the server is unavailable, with retry and rights access",async()=>{mocks.read.mockRejectedValue(new Error("offline"));mount();await screen.findByRole("alert");expect(mocks.mounted).not.toHaveBeenCalled();expect(screen.getByRole("link",{name:"Continuar sem autorizar"})).toHaveAttribute("href","/minha-privacidade");mocks.read.mockResolvedValue(allowed);fireEvent.click(screen.getByRole("button",{name:"Tentar novamente"}));await screen.findByText("Dados da equipe");});
 it("never opens protected data after a failed save",async()=>{mocks.save.mockRejectedValue(new Error("Falha ao salvar"));mount();fireEvent.click(await screen.findByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Autorizar e continuar"}));await screen.findByRole("alert");await waitFor(()=>expect(mocks.mounted).not.toHaveBeenCalled());});
});
