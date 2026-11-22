// Verified sample rows transcribed from the instructor's Fluid Property Tables(1).pdf.
// A-3 printed p.950; A-7 p.954; A-9 p.956; A-10 p.957.
// Only listed rows are available. Do not extrapolate or imply full table coverage.
export type PropertyRow={t:number;rho:number;mu:number;cp?:number;k?:number;nu?:number;pr?:number};
export type FluidTable={id:string;name:string;table:string;condition:string;rows:PropertyRow[]};
export const fluidTables:FluidTable[]=[
 {id:'water',name:'Saturated water (liquid)',table:'A–3 · p.950',condition:'Saturated liquid; pressure equals saturation pressure at temperature',rows:[
 {t:0.01,rho:999.8,mu:1.792e-3,cp:4217,k:0.561,pr:13.5},
 {t:5,rho:999.9,mu:1.519e-3,cp:4205,k:0.571,pr:11.2},
 {t:10,rho:999.7,mu:1.307e-3,cp:4194,k:0.58,pr:9.45},
 {t:15,rho:999.1,mu:1.138e-3,cp:4186,k:0.589,pr:8.09},
 {t:20,rho:998,mu:1.002e-3,cp:4182,k:0.598,pr:7.01},
 {t:25,rho:997,mu:0.891e-3,cp:4180,k:0.607,pr:6.14},
 {t:30,rho:996,mu:0.798e-3,cp:4178,k:0.615,pr:5.42},
 {t:35,rho:994,mu:0.72e-3,cp:4178,k:0.623,pr:4.83},
 {t:40,rho:992.1,mu:0.653e-3,cp:4179,k:0.631,pr:4.32},
 {t:45,rho:990.1,mu:0.596e-3,cp:4180,k:0.637,pr:3.91},
 {t:50,rho:988.1,mu:0.547e-3,cp:4181,k:0.644,pr:3.55},
 {t:55,rho:985.2,mu:0.504e-3,cp:4183,k:0.649,pr:3.25},
 {t:60,rho:983.3,mu:0.467e-3,cp:4185,k:0.654,pr:2.99},
 {t:65,rho:980.4,mu:0.433e-3,cp:4187,k:0.659,pr:2.75},
 {t:70,rho:977.5,mu:0.404e-3,cp:4190,k:0.663,pr:2.55},
 {t:75,rho:974.7,mu:0.378e-3,cp:4193,k:0.667,pr:2.38},
 {t:80,rho:971.8,mu:0.355e-3,cp:4197,k:0.67,pr:2.22},
 {t:85,rho:968.1,mu:0.333e-3,cp:4201,k:0.673,pr:2.08},
 {t:90,rho:965.3,mu:0.315e-3,cp:4206,k:0.675,pr:1.96},
 {t:95,rho:961.5,mu:0.297e-3,cp:4212,k:0.677,pr:1.85},
 {t:100,rho:957.9,mu:0.282e-3,cp:4217,k:0.679,pr:1.75},
 {t:110,rho:950.6,mu:0.255e-3,cp:4229,k:0.682,pr:1.58},
 {t:120,rho:943.4,mu:0.232e-3,cp:4244,k:0.683,pr:1.44},
 {t:130,rho:934.6,mu:0.213e-3,cp:4263,k:0.684,pr:1.33},
 {t:140,rho:921.7,mu:0.197e-3,cp:4286,k:0.683,pr:1.24},
 {t:150,rho:916.6,mu:0.183e-3,cp:4311,k:0.682,pr:1.16},
 {t:160,rho:907.4,mu:0.17e-3,cp:4340,k:0.68,pr:1.09},
 {t:170,rho:897.7,mu:0.16e-3,cp:4370,k:0.677,pr:1.03},
 {t:180,rho:887.3,mu:0.15e-3,cp:4410,k:0.673,pr:0.983},
 {t:190,rho:876.4,mu:0.142e-3,cp:4460,k:0.669,pr:0.947},
 {t:200,rho:864.3,mu:0.134e-3,cp:4500,k:0.663,pr:0.91},
 {t:220,rho:840.3,mu:0.122e-3,cp:4610,k:0.65,pr:0.865},
 {t:240,rho:813.7,mu:0.111e-3,cp:4760,k:0.632,pr:0.836},
 {t:260,rho:783.7,mu:0.102e-3,cp:4970,k:0.609,pr:0.832},
 {t:280,rho:750.8,mu:0.094e-3,cp:5280,k:0.581,pr:0.854},
 {t:300,rho:713.8,mu:0.086e-3,cp:5750,k:0.548,pr:0.902},
 {t:320,rho:667.1,mu:0.078e-3,cp:6540,k:0.509,pr:1},
 {t:340,rho:610.5,mu:0.07e-3,cp:8240,k:0.469,pr:1.23},
 {t:360,rho:528.3,mu:0.06e-3,cp:14690,k:0.427,pr:2.06}
 ]},
 {id:'air',name:'Air',table:'A–9 · p.956',condition:'1 atm',rows:[
 {t:-150,rho:2.866,mu:8.636e-6,cp:983,k:.01171,nu:3.013e-6,pr:.7246},
 {t:-50,rho:1.582,mu:1.474e-5,cp:999,k:.01979,nu:9.319e-6,pr:.7440},
 {t:-40,rho:1.514,mu:1.527e-5,cp:1002,k:.02057,nu:1.008e-5,pr:.7436},
 {t:-30,rho:1.451,mu:1.579e-5,cp:1004,k:.02134,nu:1.087e-5,pr:.7425},
 {t:-20,rho:1.394,mu:1.630e-5,cp:1005,k:.02211,nu:1.169e-5,pr:.7408},
 {t:-10,rho:1.341,mu:1.680e-5,cp:1006,k:.02288,nu:1.252e-5,pr:.7387},
 {t:0,rho:1.292,mu:1.729e-5,cp:1006,k:.02364,nu:1.338e-5,pr:.7362},
 {t:5,rho:1.269,mu:1.754e-5,cp:1006,k:.02401,nu:1.382e-5,pr:.7350},
 {t:10,rho:1.246,mu:1.778e-5,cp:1006,k:.02439,nu:1.426e-5,pr:.7336},
 {t:15,rho:1.225,mu:1.802e-5,cp:1007,k:.02476,nu:1.470e-5,pr:.7323},
 {t:20,rho:1.204,mu:1.825e-5,cp:1007,k:.02514,nu:1.516e-5,pr:.7309},
 {t:25,rho:1.184,mu:1.849e-5,cp:1007,k:.02551,nu:1.562e-5,pr:.7296},
 {t:30,rho:1.164,mu:1.872e-5,cp:1007,k:.02588,nu:1.608e-5,pr:.7282},
 {t:40,rho:1.127,mu:1.918e-5,cp:1007,k:.02662,nu:1.702e-5,pr:.7255},
 {t:50,rho:1.092,mu:1.963e-5,cp:1007,k:.02735,nu:1.798e-5,pr:.7228},
 {t:100,rho:.9458,mu:2.181e-5,cp:1009,k:.03095,nu:2.306e-5,pr:.7111},
 {t:200,rho:.7459,mu:2.577e-5,cp:1023,k:.03779,nu:3.455e-5,pr:.6974},
 {t:300,rho:.6158,mu:2.934e-5,cp:1044,k:.04418,nu:4.765e-5,pr:.6935},
 {t:400,rho:.5243,mu:3.261e-5,cp:1069,k:.05015,nu:6.219e-5,pr:.6948},
 {t:500,rho:.4565,mu:3.563e-5,cp:1093,k:.05572,nu:7.806e-5,pr:.6986},
 {t:600,rho:.4042,mu:3.846e-5,cp:1115,k:.06093,nu:9.515e-5,pr:.7037},
 {t:800,rho:.3289,mu:4.362e-5,cp:1153,k:.07037,nu:1.326e-4,pr:.7149},
 {t:1000,rho:.2772,mu:4.826e-5,cp:1184,k:.07868,nu:1.741e-4,pr:.7260},
 {t:1500,rho:.1990,mu:5.817e-5,cp:1234,k:.09599,nu:2.922e-4,pr:.7478},
 {t:2000,rho:.1553,mu:6.630e-5,cp:1264,k:.11113,nu:4.270e-4,pr:.7539}
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
 {t:200,rho:1.1336,mu:2.276e-5,cp:995.2,k:.03044,nu:2.008e-5,pr:.7442},
 {t:300,rho:.9358,mu:2.682e-5,cp:1060,k:.03814,nu:2.866e-5,pr:.7450},
 {t:400,rho:.7968,mu:3.061e-5,cp:1112,k:.04565,nu:3.842e-5,pr:.7458},
 {t:500,rho:.6937,mu:3.416e-5,cp:1156,k:.05293,nu:4.924e-5,pr:.7460},
 {t:1000,rho:.4213,mu:4.898e-5,cp:1292,k:.08491,nu:1.162e-4,pr:.7455},
 {t:1500,rho:.3025,mu:6.106e-5,cp:1356,k:.10688,nu:2.019e-4,pr:.7745},
 {t:2000,rho:.2359,mu:7.322e-5,cp:1387,k:.11522,nu:3.103e-4,pr:.8815}
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
