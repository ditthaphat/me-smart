// Additional columns transcribed from supplied PDF Table A–3 (printed page 950).
// Blank source cells remain undefined. Units: psat kPa, rhoV kg/m3, hfg kJ/kg,
// cpV J/(kg K), kV W/(m K), muV kg/(m s), prV dimensionless,
// beta 1/K, sigma N/m. Never interpolate across missing values.
export type WaterSupplement={t:number;psat?:number;rhoV?:number;hfg?:number;cpV?:number;kV?:number;muV?:number;prV?:number;beta?:number;sigma?:number};
const raw="0.01|.6113|.0048|2501|1854|.0171|.922|1|-.068|.0756\n5|.8721|.0068|2490|1857|.0173|.934|1|.015|.0749\n10|1.2276|.0094|2478|1862|.0176|.946|1|.733|.0742\n15|1.7051|.0128|2466|1863|.0179|.959|1|.138|.0735\n20|2.339|.0173|2454|1867|.0182|.973|1|.195|.0727\n25|3.169|.0231|2442|1870|.0186|.987|1|.247|.0720\n30|4.246|.0304|2431|1875|.0189|1.001|1|.294|.0712\n35|5.628|.0397|2419|1880|.0192|1.016|1|.337|.0704\n40|7.384|.0512|2407|1885|.0196|1.031|1|.377|.0696\n45|9.593|.0655|2395|1892|.0200|1.046|1|.415|.0688\n50|12.35|.0831|2383|1900|.0204|1.062|1|.451|.0679\n55|15.76|.1045|2371|1908|.0208|1.077|1|.484|.0671\n60|19.94|.1304|2359|1916|.0212|1.093|1|.517|.0662\n65|25.03|.1614|2346|1926|.0216|1.110|1|.548|.0654\n70|31.19|.1983|2334|1936|.0221|1.126|1|.578|.0645\n75|38.58|.2421|2321|1948|.0225|1.142|1|.607|.0636\n80|47.39|.2935|2309|1962|.0230|1.159|1|.653|.0627\n85|57.83|.3536|2296|1977|.0235|1.176|1|.670|.0617\n90|70.14|.4235|2283|1993|.0240|1.193|1|.702|.0608\n95|84.55|.5045|2270|2010|.0246|1.210|1|.716|.0599\n100|101.33|.5978|2257|2029|.0251|1.227|1|.750|.0589\n110|143.27|.8263|2230|2071|.0262|1.261|1|.798|.0570\n120|198.53|1.121|2203|2120|.0275|1.296|1|.858|.0550\n130|270.1|1.496|2174|2177|.0288|1.330|1.01|.913|.0529\n140|361.3|1.965|2145|2244|.0301|1.365|1.02|.970|.0509\n150|475.8|2.546|2114|2314|.0316|1.399|1.02|1.025|.0487\n160|617.8|3.256|2083|2420|.0331|1.434|1.05|1.145|.0466\n170|791.7|4.119|2050|2490|.0347|1.468|1.05|1.178|.0444\n180|1002.1|5.153|2015|2590|.0364|1.502|1.07|1.210|.0422\n190|1254.4|6.388|1979|2710|.0382|1.537|1.09|1.280|.0399\n200|1553.8|7.852|1941|2840|.0401|1.571|1.11|1.350|.0377\n220|2318|11.60|1859|3110|.0442|1.641|1.15|1.520|.0331\n240|3344|16.73|1767|3520|.0487|1.712|1.24|1.720|.0284\n260|4688|23.69|1663|4070|.0540|1.788|1.35|2.000|.0237\n280|6412|33.15|1544|4835|.0605|1.870|1.49|2.380|.0190\n300|8581|46.15|1405|5980|.0695|1.965|1.69|2.950|.0144\n320|11274|64.57|1239|7900|.0836|2.084|1.97||.0099\n340|14586|92.62|1028|11870|.110|2.255|2.43||.0056\n360|18651|144|720|25800|.178|2.571|3.73||.0019\n374.14|22090|317|0||||||0";
export const waterSupplement:WaterSupplement[]=raw.split('\n').map(line=>{
 const [t,psat,rhoV,hfg,cpV,kV,muV,prV,beta,sigma]=line.split('|');
 const val=(s:string)=>s===''?undefined:Number(s);
 return {t:Number(t),psat:val(psat),rhoV:val(rhoV),hfg:val(hfg),cpV:val(cpV),kV:val(kV),muV:muV===''?undefined:Number(muV)*1e-5,prV:val(prV),beta:beta===''?undefined:Number(beta)*1e-3,sigma:val(sigma)};
});
export function lookupWaterSupplement(t:number):WaterSupplement|null{
 if(!Number.isFinite(t)||t<waterSupplement[0].t||t>waterSupplement[waterSupplement.length-1].t)return null;
 const exact=waterSupplement.find(r=>r.t===t);if(exact)return exact;
 const i=waterSupplement.findIndex(r=>r.t>t);const a=waterSupplement[i-1],b=waterSupplement[i];
 const f=(t-a.t)/(b.t-a.t);const out:WaterSupplement={t};
 for(const k of ['psat','rhoV','hfg','cpV','kV','muV','prV','beta','sigma'] as const){
 if(a[k]!==undefined&&b[k]!==undefined)out[k]=a[k]!+(b[k]!-a[k]!)*f;
 }
 return out;
}
