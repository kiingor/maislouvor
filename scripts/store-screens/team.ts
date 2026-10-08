const team={id:'team-demo',name:'Equipe Demonstração',role:'admin'};
export const TeamProvider=({children}:any)=>children;
export const useTeam=()=>({currentTeam:team,teams:[team],pendingTeams:[],switchTeam:()=>{},refetch:async()=>{},can:()=>true,profileId:'profile-demo',isAdmin:true,canEdit:true,isEditor:true,loading:false});
