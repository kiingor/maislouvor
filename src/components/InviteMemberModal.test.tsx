import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InviteMemberModal } from "./InviteMemberModal";
const mocks=vi.hoisted(()=>({invoke:vi.fn(),capacity:vi.fn(),close:vi.fn(),plan:vi.fn(),toast:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock("@/contexts/TeamContext",()=>({useTeam:()=>({profileId:'person',currentTeam:{id:'team'},teams:[{id:'team',name:'Equipe',role:'admin'}]})}));
vi.mock("@/lib/billing/api",()=>({getMemberCapacity:mocks.capacity}));
vi.mock("@/hooks/use-toast",()=>({useToast:()=>({toast:mocks.toast})}));
function mount(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><InviteMemberModal open onOpenChange={mocks.close} onChoosePlan={mocks.plan}/></QueryClientProvider>);}
beforeEach(()=>{cleanup();vi.clearAllMocks();mocks.capacity.mockResolvedValue({can_add_member:true,member_limit:5,member_count:2,can_manage:true});mocks.invoke.mockResolvedValue({data:{token:'demo-token'},error:null});});
describe('invitation with personal choice',()=>{
 it('creates a shareable link without asking the leader for a password or enrolling another person',async()=>{mount();const email=await screen.findByLabelText('Email');expect(screen.queryByLabelText('Senha inicial')).not.toBeInTheDocument();fireEvent.change(email,{target:{value:'person@example.org'}});fireEvent.submit(email.closest('form')!);await screen.findByDisplayValue('https://maislouvor.com/invite/demo-token');expect(mocks.invoke).toHaveBeenCalledWith('create-invite',{body:{email:'person@example.org',team_id:'team',role:'viewer'}});expect(mocks.close).not.toHaveBeenCalled();expect(screen.getByText(/Nenhum e-mail é enviado automaticamente/)).toBeInTheDocument();});
 it('preserves the RevenueCat capacity flow when a team is full',async()=>{mocks.capacity.mockResolvedValue({can_add_member:false,member_limit:5,member_count:5,can_manage:true,effective_plan:'essencial'});mount();fireEvent.click(await screen.findByRole('button',{name:'Escolher plano e continuar'}));await waitFor(()=>expect(mocks.plan).toHaveBeenCalledWith(6,'team'));expect(mocks.invoke).not.toHaveBeenCalled();});
});
