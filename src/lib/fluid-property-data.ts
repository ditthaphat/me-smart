// Verified sample rows transcribed from the instructor's Fluid Property Tables(1).pdf.
// A-3 printed p.950; A-7 p.954; A-9 p.956; A-10 p.957.
// Only listed rows are available. Do not extrapolate or imply full table coverage.
export type PropertyRow={t:number;rho:number;mu:number;cp?:number;k?:number;nu?:number;pr?:number;alpha?:number;beta?:number};
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
 {id:"isobutane",name:"Isobutane (R600a)",table:"A–7 · p.954",condition:"Liquid",rows:[
{t:-100,rho:683.8,cp:1881,k:0.1383,alpha:1.075e-7,mu:0.0009305,nu:0.00000136,pr:12.65,beta:0.00142},
{t:-75,rho:659.3,cp:1970,k:0.1357,alpha:1.044e-7,mu:0.0005624,nu:8.531e-7,pr:8.167,beta:0.0015},
{t:-50,rho:634.3,cp:2069,k:0.1283,alpha:9.773e-8,mu:0.0003769,nu:5.942e-7,pr:6.079,beta:0.00161},
{t:-25,rho:608.2,cp:2180,k:0.1181,alpha:8.906e-8,mu:0.0002688,nu:4.42e-7,pr:4.963,beta:0.00177},
{t:0,rho:580.6,cp:2306,k:0.1068,alpha:7.974e-8,mu:0.0001993,nu:3.432e-7,pr:4.304,beta:0.00199},
{t:25,rho:550.7,cp:2455,k:0.0956,alpha:7.069e-8,mu:0.000151,nu:2.743e-7,pr:3.88,beta:0.00232},
{t:50,rho:517.3,cp:2640,k:0.0851,alpha:6.233e-8,mu:0.0001155,nu:2.233e-7,pr:3.582,beta:0.00286},
{t:75,rho:478.5,cp:2896,k:0.0757,alpha:5.46e-8,mu:0.00008785,nu:1.836e-7,pr:3.363,beta:0.00385},
{t:100,rho:429.6,cp:3361,k:0.0669,alpha:4.634e-8,mu:0.00006483,nu:1.509e-7,pr:3.256,beta:0.00628}
]},
 {id:"glycerin",name:"Glycerin",table:"A–7 · p.954",condition:"Liquid; volume expansion coefficient not listed",rows:[
{t:0,rho:1276,cp:2262,k:0.282,alpha:9.773e-8,mu:10.49,nu:0.008219,pr:84101},
{t:5,rho:1273,cp:2288,k:0.2835,alpha:9.732e-8,mu:6.73,nu:0.005287,pr:54327},
{t:10,rho:1270,cp:2320,k:0.2846,alpha:9.662e-8,mu:4.241,nu:0.003339,pr:34561},
{t:15,rho:1267,cp:2354,k:0.2856,alpha:9.576e-8,mu:2.496,nu:0.00197,pr:20570},
{t:20,rho:1264,cp:2386,k:0.286,alpha:9.484e-8,mu:1.519,nu:0.001201,pr:12671},
{t:25,rho:1261,cp:2416,k:0.286,alpha:9.388e-8,mu:0.9934,nu:0.0007878,pr:8392},
{t:30,rho:1258,cp:2447,k:0.286,alpha:9.291e-8,mu:0.6582,nu:0.0005232,pr:5631},
{t:35,rho:1255,cp:2478,k:0.286,alpha:9.195e-8,mu:0.4347,nu:0.0003464,pr:3767},
{t:40,rho:1252,cp:2513,k:0.2863,alpha:9.101e-8,mu:0.3073,nu:0.0002455,pr:2697}
]},
 {id:"engine-oil",name:"Engine oil (unused)",table:"A–7 · p.954",condition:"Liquid",rows:[
{t:0,rho:899,cp:1797,k:0.1469,alpha:9.097e-8,mu:3.814,nu:0.004242,pr:46636,beta:0.0007},
{t:20,rho:888.1,cp:1881,k:0.145,alpha:8.68e-8,mu:0.8374,nu:0.0009429,pr:10863,beta:0.0007},
{t:40,rho:876,cp:1964,k:0.1444,alpha:8.391e-8,mu:0.2177,nu:0.0002485,pr:2962,beta:0.0007},
{t:60,rho:863.9,cp:2048,k:0.1404,alpha:7.934e-8,mu:0.07399,nu:0.00008565,pr:1080,beta:0.0007},
{t:80,rho:852,cp:2132,k:0.138,alpha:7.599e-8,mu:0.03232,nu:0.00003794,pr:499.3,beta:0.0007},
{t:100,rho:840,cp:2220,k:0.1367,alpha:7.33e-8,mu:0.01718,nu:0.00002046,pr:279.1,beta:0.0007},
{t:120,rho:828.9,cp:2308,k:0.1347,alpha:7.042e-8,mu:0.01029,nu:0.00001241,pr:176.3,beta:0.0007},
{t:140,rho:816.8,cp:2395,k:0.133,alpha:6.798e-8,mu:0.006558,nu:0.000008029,pr:118.1,beta:0.0007},
{t:150,rho:810.3,cp:2441,k:0.1327,alpha:6.708e-8,mu:0.005344,nu:0.000006595,pr:98.31,beta:0.0007}
]},
 {id:'mercury',name:'Mercury (Hg) — liquid metal',table:'A–8 · p.955',condition:'Liquid mercury; melting point −39°C',rows:[{t:0,rho:13595,cp:140.4,k:8.18200,alpha:4.287e-6,mu:1.687e-3,nu:1.241e-7,pr:.0289,beta:1.810e-4},
{t:25,rho:13534,cp:139.4,k:8.51533,alpha:4.514e-6,mu:1.534e-3,nu:1.133e-7,pr:.0251,beta:1.810e-4},
{t:50,rho:13473,cp:138.6,k:8.83632,alpha:4.734e-6,mu:1.423e-3,nu:1.056e-7,pr:.0223,beta:1.810e-4},
{t:75,rho:13412,cp:137.8,k:9.15632,alpha:4.956e-6,mu:1.316e-3,nu:9.819e-8,pr:.0198,beta:1.810e-4},
{t:100,rho:13351,cp:137.1,k:9.46706,alpha:5.170e-6,mu:1.245e-3,nu:9.326e-8,pr:.0180,beta:1.810e-4},
{t:150,rho:13231,cp:136.1,k:10.07780,alpha:5.595e-6,mu:1.126e-3,nu:8.514e-8,pr:.0152,beta:1.810e-4},
{t:200,rho:13112,cp:135.5,k:10.65465,alpha:5.996e-6,mu:1.043e-3,nu:7.959e-8,pr:.0133,beta:1.815e-4},
{t:250,rho:12993,cp:135.3,k:11.18150,alpha:6.363e-6,mu:9.820e-4,nu:7.558e-8,pr:.0119,beta:1.829e-4},
{t:300,rho:12873,cp:135.3,k:11.68150,alpha:6.705e-6,mu:9.336e-4,nu:7.252e-8,pr:.0108,beta:1.854e-4}]},
 {id:"bismuth",name:"Bismuth (Bi) — liquid metal",table:'A–8 · p.955',condition:"Melting point 271°C",rows:[{t:350,rho:9969,cp:146,k:16.28,alpha:1.118e-5,mu:1.540e-3,nu:1.545e-7,pr:.01381},{t:400,rho:9908,cp:148.2,k:16.10,alpha:1.096e-5,mu:1.422e-3,nu:1.436e-7,pr:.01310},{t:500,rho:9785,cp:152.8,k:15.74,alpha:1.052e-5,mu:1.188e-3,nu:1.215e-7,pr:.01154},{t:600,rho:9663,cp:157.3,k:15.60,alpha:1.026e-5,mu:1.013e-3,nu:1.048e-7,pr:.01022},{t:700,rho:9540,cp:161.8,k:15.60,alpha:1.010e-5,mu:8.736e-4,nu:9.157e-8,pr:.00906}]},
 {id:"lead",name:"Lead (Pb) — liquid metal",table:'A–8 · p.955',condition:"Melting point 327°C",rows:[{t:400,rho:10506,cp:158,k:15.97,alpha:9.623e-6,mu:2.277e-3,nu:2.167e-7,pr:.02252},{t:450,rho:10449,cp:156,k:15.74,alpha:9.649e-6,mu:2.065e-3,nu:1.976e-7,pr:.02048},{t:500,rho:10390,cp:155,k:15.54,alpha:9.651e-6,mu:1.884e-3,nu:1.814e-7,pr:.01879},{t:550,rho:10329,cp:155,k:15.39,alpha:9.610e-6,mu:1.758e-3,nu:1.702e-7,pr:.01771},{t:600,rho:10267,cp:155,k:15.23,alpha:9.568e-6,mu:1.632e-3,nu:1.589e-7,pr:.01661},{t:650,rho:10206,cp:155,k:15.07,alpha:9.526e-6,mu:1.505e-3,nu:1.475e-7,pr:.01549},{t:700,rho:10145,cp:155,k:14.91,alpha:9.483e-6,mu:1.379e-3,nu:1.360e-7,pr:.01434}]},
 {id:"sodium",name:"Sodium (Na) — liquid metal",table:'A–8 · p.955',condition:"Melting point 98°C",rows:[{t:100,rho:927.3,cp:1378,k:85.84,alpha:6.718e-5,mu:6.892e-4,nu:7.432e-7,pr:.01106},{t:200,rho:902.5,cp:1349,k:80.84,alpha:6.639e-5,mu:5.385e-4,nu:5.967e-7,pr:.008987},{t:300,rho:877.8,cp:1320,k:75.84,alpha:6.544e-5,mu:3.878e-4,nu:4.418e-7,pr:.006751},{t:400,rho:853,cp:1296,k:71.20,alpha:6.437e-5,mu:2.720e-4,nu:3.188e-7,pr:.004953},{t:500,rho:828.5,cp:1284,k:67.41,alpha:6.335e-5,mu:2.411e-4,nu:2.909e-7,pr:.004593},{t:600,rho:804,cp:1272,k:63.63,alpha:6.220e-5,mu:2.101e-4,nu:2.614e-7,pr:.004202}]},
 {id:"potassium",name:"Potassium (K) — liquid metal",table:'A–8 · p.955',condition:"Melting point 64°C",rows:[{t:200,rho:795.2,cp:790.8,k:43.99,alpha:6.995e-5,mu:3.350e-4,nu:4.213e-7,pr:.006023},{t:300,rho:771.6,cp:772.8,k:42.01,alpha:7.045e-5,mu:2.667e-4,nu:3.456e-7,pr:.004906},{t:400,rho:748,cp:754.8,k:40.03,alpha:7.090e-5,mu:1.984e-4,nu:2.652e-7,pr:.00374},{t:500,rho:723.9,cp:750,k:37.81,alpha:6.964e-5,mu:1.668e-4,nu:2.304e-7,pr:.003309},{t:600,rho:699.6,cp:750,k:35.50,alpha:6.765e-5,mu:1.487e-4,nu:2.126e-7,pr:.003143}]},
 {id:"nak",name:"Sodium–Potassium (22% Na, 78% K)",table:'A–8 · p.955',condition:"Melting point −11°C",rows:[{t:100,rho:847.3,cp:944.4,k:25.64,alpha:3.205e-5,mu:5.707e-4,nu:6.736e-7,pr:.02102},{t:200,rho:823.2,cp:922.5,k:26.27,alpha:3.459e-5,mu:4.587e-4,nu:5.572e-7,pr:.01611},{t:300,rho:799.1,cp:900.6,k:26.89,alpha:3.736e-5,mu:3.467e-4,nu:4.339e-7,pr:.01161},{t:400,rho:775,cp:879,k:27.50,alpha:4.037e-5,mu:2.357e-4,nu:3.041e-7,pr:.00753},{t:500,rho:751.5,cp:880.1,k:27.89,alpha:4.217e-5,mu:2.108e-4,nu:2.805e-7,pr:.00665},{t:600,rho:728,cp:881.2,k:28.28,alpha:4.408e-5,mu:1.859e-4,nu:2.553e-7,pr:.00579}]},
 {id:'methane-liquid',name:'Methane (CH₄) — liquid',table:'A–7 · p.954',condition:'Liquid methane, source tabulated range −160 to −90°C',rows:[{t:-160,rho:420.2,cp:3492,k:.1863,alpha:1.270e-7,mu:1.133e-4,nu:2.699e-7,pr:2.126,beta:.00352},{t:-150,rho:405,cp:3580,k:.1703,alpha:1.174e-7,mu:9.169e-5,nu:2.264e-7,pr:1.927,beta:.00391},{t:-140,rho:388.8,cp:3700,k:.1550,alpha:1.077e-7,mu:7.551e-5,nu:1.942e-7,pr:1.803,beta:.00444},{t:-130,rho:371.1,cp:3875,k:.1402,alpha:9.749e-8,mu:6.288e-5,nu:1.694e-7,pr:1.738,beta:.00520},{t:-120,rho:351.4,cp:4146,k:.1258,alpha:8.634e-8,mu:5.257e-5,nu:1.496e-7,pr:1.732,beta:.00637},{t:-110,rho:328.8,cp:4611,k:.1115,alpha:7.356e-8,mu:4.377e-5,nu:1.331e-7,pr:1.810,beta:.00841},{t:-100,rho:301,cp:5578,k:.0967,alpha:5.761e-8,mu:3.577e-5,nu:1.188e-7,pr:2.063,beta:.01282},{t:-90,rho:261.7,cp:8902,k:.0797,alpha:3.423e-8,mu:2.761e-5,nu:1.055e-7,pr:3.082,beta:.02922}]},
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
 {t:20,rho:788.4,mu:5.857e-4,cp:2515,k:.1987,nu:7.429e-7,pr:7.414,alpha:1.002e-7,beta:.00118},
 {t:30,rho:779.1,mu:5.088e-4,cp:2577,k:.1980,nu:6.531e-7,pr:6.622,alpha:9.862e-8,beta:.00120},
 {t:40,rho:769.6,mu:4.460e-4,cp:2644,k:.1972,nu:5.795e-7,pr:5.980,alpha:9.690e-8,beta:.00123},
 {t:50,rho:760.1,mu:3.942e-4,cp:2718,k:.1965,nu:5.185e-7,pr:5.453,alpha:9.509e-8,beta:.00127},
 {t:60,rho:750.4,mu:3.510e-4,cp:2798,k:.1957,nu:4.677e-7,pr:5.018,alpha:9.320e-8,beta:.00132},
 {t:70,rho:740.4,mu:3.146e-4,cp:2885,k:.1950,nu:4.250e-7,pr:4.655,alpha:9.128e-8,beta:.00137}
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
 for(const key of ['cp','k','nu','pr','alpha','beta'] as const){if(lower[key]!==undefined&&upper[key]!==undefined)row[key]=lower[key]!+(upper[key]!-lower[key]!)*fraction;}
 return {row,lower,upper,interpolated:true};
}
