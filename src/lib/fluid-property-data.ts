// Verified sample rows transcribed from the instructor's Fluid Property Tables(1).pdf.
// A-3 printed p.950; A-7 p.954; A-9 p.956; A-10 p.957.
// Only listed rows are available. Do not extrapolate or imply full table coverage.
export type PropertyRow={t:number;rho:number;mu:number;cp?:number;k?:number;nu?:number;pr?:number};
export type FluidTable={id:string;name:string;table:string;condition:string;rows:PropertyRow[]};
export const fluidTables:FluidTable[]=[
 {id:'water',name:'Saturated water (liquid)',table:'A–3 · p.950',condition:'Saturated liquid; pressure equals saturation pressure at temperature',rows:[
 {t:20,rho:998,mu:1.002e-3,cp:4182,k:.598,pr:7.01},
 {t:25,rho:997,mu:.891e-3,cp:4180,k:.607,pr:6.14},
 {t:30,rho:996,mu:.798e-3,cp:4178,k:.615,pr:5.42},
 {t:40,rho:992.1,mu:.653e-3,cp:4179,k:.631,pr:4.32}
 ]},
 {id:'air',name:'Air',table:'A–9 · p.956',condition:'1 atm',rows:[
 {t:20,rho:1.204,mu:1.825e-5,cp:1007,k:.02514,nu:1.516e-5,pr:.7309},
 {t:25,rho:1.184,mu:1.849e-5,cp:1007,k:.02551,nu:1.562e-5,pr:.7296},
 {t:30,rho:1.164,mu:1.872e-5,cp:1007,k:.02588,nu:1.608e-5,pr:.7282},
 {t:40,rho:1.127,mu:1.918e-5,cp:1007,k:.02662,nu:1.702e-5,pr:.7255}
 ]},
 {id:'methanol',name:'Methanol (liquid)',table:'A–7 · p.954',condition:'Liquid in tabulated temperature range',rows:[
 {t:20,rho:788.4,mu:5.857e-4,cp:2515,k:.1987,nu:7.429e-7,pr:7.414},
 {t:30,rho:779.1,mu:5.088e-4,cp:2577,k:.1980,nu:6.531e-7,pr:6.622},
 {t:40,rho:769.6,mu:4.460e-4,cp:2644,k:.1972,nu:5.795e-7,pr:5.980},
 {t:50,rho:760.1,mu:3.942e-4,cp:2718,k:.1965,nu:5.185e-7,pr:5.453},
 {t:60,rho:750.4,mu:3.510e-4,cp:2798,k:.1957,nu:4.677e-7,pr:5.018},
 {t:70,rho:740.4,mu:3.146e-4,cp:2885,k:.1950,nu:4.250e-7,pr:4.655}
 ]},
 {id:'co2',name:'Carbon dioxide (CO₂)',table:'A–10 · p.957',condition:'1 atm',rows:[
 {t:-50,rho:2.4035,mu:1.129e-5,cp:746,k:.01051,nu:4.699e-6,pr:.8019},
 {t:0,rho:1.9635,mu:1.375e-5,cp:811,k:.01456,nu:7.003e-6,pr:.7661},
 {t:50,rho:1.6597,mu:1.612e-5,cp:866.6,k:.01858,nu:9.714e-6,pr:.7520},
 {t:100,rho:1.4373,mu:1.841e-5,cp:914.8,k:.02257,nu:1.281e-5,pr:.7464},
 {t:150,rho:1.2675,mu:2.063e-5,cp:957.4,k:.02652,nu:1.627e-5,pr:.7445},
 {t:200,rho:1.1336,mu:2.276e-5,cp:995.2,k:.03044,nu:2.008e-5,pr:.7442}
 ]}
];
export function lookup(rows:PropertyRow[],temperature:number){
 if(!Number.isFinite(temperature)||temperature<rows[0].t||temperature>rows[rows.length-1].t)return null;
 const exact=rows.find(r=>r.t===temperature);if(exact)return {row:exact,lower:exact,upper:exact,interpolated:false};
 const upperIndex=rows.findIndex(r=>r.t>temperature);const lower=rows[upperIndex-1],upper=rows[upperIndex];
 const fraction=(temperature-lower.t)/(upper.t-lower.t);
 const row:PropertyRow={t:temperature,rho:lower.rho+(upper.rho-lower.rho)*fraction,mu:lower.mu+(upper.mu-lower.mu)*fraction};
 for(const key of ['cp','k','nu','pr'] as const){if(lower[key]!==undefined&&upper[key]!==undefined)row[key]=lower[key]!+(upper[key]!-lower[key]!)*fraction;}
 return {row,lower,upper,interpolated:true};
}
