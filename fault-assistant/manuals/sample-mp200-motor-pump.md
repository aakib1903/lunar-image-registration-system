---
id: mp200
title: MP-200 Motor-Pump Set (SAMPLE) | MP-200 મોટર-પંપ સેટ (નમૂનો)
revision: 2026-01
---
<!--
SAMPLE MANUAL. The equipment, fault codes and procedures are invented for demonstration.
Replace this file with your site's approved manual before any field use.
Gujarati wording must be checked by a Gujarati-speaking technician.

Authoring rules:
- "## ID | English heading | Gujarati heading"
- "codes:" lists display codes exactly as shown on the panel.
- "symptom:", "safety:", "note:" and numbered steps take "English | Gujarati".
- A line with only one language is allowed; the script decides which it is.
-->

## FAULT-01 | Motor does not start | મોટર શરૂ થતી નથી
codes: E-14
symptom: Start pressed, motor is silent and the run lamp stays off | સ્ટાર્ટ દબાવ્યા પછી મોટર અવાજ કરતી નથી અને રન લેમ્પ ચાલુ થતો નથી
safety: Isolate the supply and lock out before opening the terminal box or touching any conductor | ટર્મિનલ બોક્સ ખોલતાં કે કોઈ વાહક અડતાં પહેલાં વીજપુરવઠો બંધ કરી લોક લગાવો
1. Check that the main isolator and the panel supply are ON. | મુખ્ય આઇસોલેટર અને પેનલનો વીજપુરવઠો ચાલુ છે કે નહીં તે તપાસો.
2. Measure the supply voltage at the panel input with the meter on AC volts. Expected: 400 V ±10 % between phases. | મીટર AC વોલ્ટ પર રાખી પેનલના ઇનપુટ પર વીજ-વોલ્ટેજ માપો. અપેક્ષિત: ફેઝ વચ્ચે 400 V ±10 %.
3. If one phase reads zero or much lower than the others, the fault is upstream. Inform the electrical supervisor and do not restart. | કોઈ એક ફેઝ શૂન્ય અથવા બીજા કરતાં ઘણો ઓછો હોય તો ખામી ઉપરના ભાગમાં છે. ઇલેક્ટ્રિકલ સુપરવાઇઝરને જાણ કરો અને ફરી ચાલુ ન કરો.
4. Check the motor overload reset button. If it is tripped, press RESET once and wait 30 seconds before the next start. | મોટર ઓવરલોડ રીસેટ બટન તપાસો. તે ટ્રિપ થયેલું હોય તો RESET એકવાર દબાવો અને આગળ ચાલુ કરતાં પહેલાં 30 સેકન્ડ રાહ જુઓ.
5. Check the phase sequence relay. If the lamp shows wrong sequence, swap any two motor supply leads only after isolation and lock-out. | ફેઝ ક્રમ રિલે તપાસો. લેમ્પ ખોટો ક્રમ બતાવે તો માત્ર આઇસોલેશન અને લોક પછી મોટર સપ્લાયના કોઈ પણ બે લીડ બદલો.
6. If the start command still does nothing and the supply is correct, check the start button and its wiring for loose terminals. | વીજપુરવઠો સાચો હોવા છતાં સ્ટાર્ટ આદેશથી કંઈ ન થાય તો સ્ટાર્ટ બટન અને તેના વાયરિંગમાં ઢીલા ટર્મિનલ તપાસો.
note: If E-14 returns within 10 minutes of a successful reset, stop the set and report it. Repeated restarts can damage the windings. | સફળ રીસેટ પછી 10 મિનિટમાં E-14 ફરી આવે તો સેટ બંધ કરી જાણ કરો. વારંવાર ફરી ચાલુ કરવાથી વાઇન્ડિંગને નુકસાન થઈ શકે છે.

## FAULT-02 | Motor overheats | મોટર વધુ ગરમ થાય છે
codes: E-21
symptom: Motor casing is too hot to hold for more than a few seconds, or the display shows E-21 | મોટર કેસિંગ કેટલીક સેકન્ડથી વધુ પકડી ન શકાય તેટલું ગરમ છે, અથવા ડિસ્પ્લે E-21 બતાવે છે
safety: Do not touch the motor casing with bare hands until it has cooled. Use the thermal gloves in the store. | મોટર કેસિંગ ઠંડુ ન થાય ત્યાં સુધી ખુલ્લા હાથે અડશો નહીં. સ્ટોરમાંના થર્મલ ગ્લવ્ઝ વાપરો.
1. Confirm the set is stopped and the motor has cooled for at least 20 minutes. | ખાતરી કરો કે સેટ બંધ છે અને મોટર ઓછામાં ઓછી 20 મિનિટ ઠંડી થઈ છે.
2. Check the cooling fan at the rear of the motor. It must turn freely by hand after isolation. | મોટરની પાછળનો કૂલિંગ પંખો તપાસો. આઇસોલેશન પછી તે હાથથી સરળતાથી ફરવો જોઈએ.
3. Remove dust and debris from the fan guard and the air inlet grille with a dry brush. | સૂકા બ્રશથી પંખાના ગાર્ડ અને હવાના ઇનલેટ ગ્રિલમાંથી ધૂળ અને કચરો દૂર કરો.
4. Check the pump suction valve. If it is closed or partly closed, open it fully so the pump is not running against a dead head. | પંપનો સક્શન વાલ્વ તપાસો. તે બંધ કે અર્ધ-બંધ હોય તો પંપ ડેડ હેડ સામે ન ચાલે તે માટે તેને પૂરો ખોલો.
5. Check the motor ambient temperature. Above 40 °C, reduce the duty cycle or move the set to a cooler place as the site permits. | મોટરનું આસપાસનું તાપમાન તપાસો. 40 °C થી ઉપર હોય તો સાઇટની પરવાનગી મુજબ ડ્યુટી સાયકલ ઘટાડો અથવા સેટને ઠંડી જગ્યાએ ખસેડો.
6. Measure the running current with a clamp meter and compare it with the nameplate full-load current. A reading above 110 % of nameplate is an overload condition. | ક્લેમ્પ મીટરથી ચાલુ કરંટ માપો અને નેમપ્લેટના ફુલ-લોડ કરંટ સાથે સરખાવો. નેમપ્લેટના 110 % થી વધુ રીડિંગ ઓવરલોડ સ્થિતિ છે.
note: If the casing is still hot after the fan and the suction valve are correct, stop the set and inform the mechanical supervisor. | પંખો અને સક્શન વાલ્વ સાચા હોવા છતાં કેસિંગ ગરમ રહે તો સેટ બંધ કરી મિકેનિકલ સુપરવાઇઝરને જાણ કરો.

## FAULT-03 | Overload relay trips | ઓવરલોડ રિલે ટ્રિપ થાય છે
codes: E-52
symptom: Motor runs for a short time and then stops, the overload lamp is lit | મોટર થોડી વાર ચાલે છે અને પછી બંધ થઈ જાય છે, ઓવરલોડ લેમ્પ ચાલુ છે
safety: Isolate and lock out before resetting the overload relay from inside the panel. | પેનલની અંદરથી ઓવરલોડ રિલે રીસેટ કરતાં પહેલાં આઇસોલેટ કરી લોક લગાવો.
1. Read the relay setting. It must match the nameplate full-load current on the label. | રિલેની સેટિંગ વાંચો. તે લેબલ પરના નેમપ્લેટ ફુલ-લોડ કરંટ સાથે મેળ ખાવી જોઈએ.
2. Measure the three phase currents while the set runs. Large differences between phases suggest a supply or winding problem. | સેટ ચાલતો હોય ત્યારે ત્રણેય ફેઝના કરંટ માપો. ફેઝ વચ્ચે મોટો તફાવત હોય તો વીજપુરવઠા કે વાઇન્ડિંગની સમસ્યા હોઈ શકે છે.
3. Check that the discharge valve is not closed beyond the setting in the operating procedure. | ઓપરેટિંગ પ્રક્રિયામાં આપેલી સેટિંગ કરતાં ડિસ્ચાર્જ વાલ્વ વધુ બંધ નથી તે તપાસો.
4. Check the pump shaft for free rotation. A tight shaft draws high current at start. | પંપ શાફ્ટ મુક્તપણે ફરે છે કે નહીં તે તપાસો. ચુસ્ત શાફ્ટ શરૂઆતમાં વધુ કરંટ ખેંચે છે.
5. After the cause is corrected, reset the relay once and record the restart on the log sheet. | કારણ દૂર થયા પછી રિલે એકવાર રીસેટ કરો અને લોગ શીટમાં ફરી શરૂ થવાની નોંધ કરો.
note: If the relay trips again at the same load with the valve and shaft checked, do not raise the setting. Report the fault. | વાલ્વ અને શાફ્ટ તપાસ્યા પછી પણ એ જ લોડ પર ફરી ટ્રિપ થાય તો સેટિંગ વધારશો નહીં. ખામીની જાણ કરો.

## FAULT-04 | Low discharge pressure or low flow | ડિસ્ચાર્જ દબાણ ઓછું અથવા પ્રવાહ ઓછો
codes: E-33
symptom: Gauge reads below the normal band, or flow is weak although the motor runs normally | ગેજ સામાન્ય મર્યાદા કરતાં ઓછું દબાણ બતાવે છે, અથવા મોટર સામાન્ય ચાલતી હોવા છતાં પ્રવાહ નબળો છે
safety: Stop the set before opening any gauge port or pipe joint. The line may be under pressure. | કોઈ ગેજ પોર્ટ કે પાઇપ જોઇન્ટ ખોલતાં પહેલાં સેટ બંધ કરો. લાઇનમાં દબાણ હોઈ શકે છે.
1. Check the water level in the suction sump. The suction strainer must be below the minimum water level. | સક્શન સંપમાં પાણીનું સ્તર તપાસો. સક્શન સ્ટ્રેનર લઘુતમ પાણીના સ્તરથી નીચે હોવું જોઈએ.
2. Check that the pump is primed. Open the priming vent until water comes out steadily, then close it. | પંપ પ્રાઇમ થયેલો છે કે નહીં તે તપાસો. પ્રાઇમિંગ વેન્ટ ખોલો, પાણી સતત નીકળે ત્યાં સુધી રાખો, પછી બંધ કરો.
3. Clean the suction strainer. Remove leaves, mud and any debris, then refit it with the gasket in place. | સક્શન સ્ટ્રેનર સાફ કરો. પાંદડાં, કાદવ અને કચરો દૂર કરો, પછી ગાસ્કેટ બરાબર મૂકીને ફરી ફિટ કરો.
4. Check the suction valve and the non-return valve. A stuck non-return valve blocks flow; free it or replace it. | સક્શન વાલ્વ અને નોન-રિટર્ન વાલ્વ તપાસો. ચોંટી ગયેલો નોન-રિટર્ન વાલ્વ પ્રવાહ અટકાવે છે; તેને છૂટો કરો અથવા બદલો.
5. Look for air leaks on the suction pipe. Bubbles in the sight glass show air entering the line. | સક્શન પાઇપ પર હવાનાં લિકેજ તપાસો. સાઇટ ગ્લાસમાં પરપોટા હવા લાઇનમાં પ્રવેશે છે તે બતાવે છે.
6. Check the impeller through the inspection port only after isolation. Remove any blockage in the impeller eye. | આઇસોલેશન પછી જ ઇન્સ્પેક્શન પોર્ટમાંથી ઇમ્પેલર તપાસો. ઇમ્પેલરની આંખમાં કોઈ અવરોધ હોય તો દૂર કરો.
note: If the pressure is still low after priming and cleaning, report E-33 with the gauge reading and the time of the reading. | પ્રાઇમિંગ અને સફાઈ પછી પણ દબાણ ઓછું હોય તો ગેજ રીડિંગ અને સમય સાથે E-33 ની જાણ કરો.

## FAULT-05 | Bearing noise or high bearing temperature | બેરિંગમાંથી અવાજ અથવા બેરિંગનું ઊંચું તાપમાન
codes: E-40
symptom: Grinding or rumbling noise from the drive end, or bearing housing temperature alarm E-40 | ડ્રાઇવ એન્ડમાંથી ઘસારા જેવો કે ગડગડાટ જેવો અવાજ, અથવા બેરિંગ હાઉસિંગ તાપમાનનો અલાર્મ E-40
safety: Isolate and lock out before any contact with rotating parts or coupling guards. | ફરતા ભાગો કે કપલિંગ ગાર્ડના સંપર્ક પહેલાં આઇસોલેટ કરી લોક લગાવો.
1. Confirm the noise is from the bearings and not from the coupling or the fan. Listen with a mechanic's stethoscope at each bearing housing. | અવાજ બેરિંગમાંથી છે, કપલિંગ કે પંખામાંથી નથી તેની ખાતરી કરો. દરેક બેરિંગ હાઉસિંગ પર મિકેનિકનું સ્ટેથોસ્કોપ વાપરી સાંભળો.
2. Check the grease level and the grease date on the bearing tag. | બેરિંગ ટેગ પર ગ્રીસનું સ્તર અને ગ્રીસની તારીખ તપાસો.
3. If the grease is due or contaminated, clean the nipple and add grease with the approved grease gun. Do not overfill. | ગ્રીસ બાકી હોય કે દૂષિત હોય તો નિપલ સાફ કરો અને મંજૂર ગ્રીસ ગનથી ગ્રીસ ભરો. વધુ ન ભરો.
4. Check shaft alignment at the coupling with a dial gauge. Correct it if the reading is outside the limit in the maintenance sheet. | ડાયલ ગેજથી કપલિંગ પર શાફ્ટ એલાઇનમેન્ટ તપાસો. મેઇન્ટેનન્સ શીટની મર્યાદા બહાર હોય તો સુધારો.
5. Check the bearing temperature with an infrared thermometer after the set has run for 30 minutes. | સેટ 30 મિનિટ ચાલ્યા પછી ઇન્ફ્રારેડ થર્મોમીટરથી બેરિંગનું તાપમાન તપાસો.
note: Do not run the set with a grinding noise. If the noise continues after greasing and alignment, stop the set and report it for bearing replacement. | ઘસારા જેવા અવાજ સાથે સેટ ચલાવશો નહીં. ગ્રીસિંગ અને એલાઇનમેન્ટ પછી પણ અવાજ રહે તો સેટ બંધ કરી બેરિંગ બદલવા માટે જાણ કરો.

## FAULT-06 | Water leaking from the pump seal | પંપ સીલમાંથી પાણી ટપકે છે
codes: E-60
symptom: Drip or steady flow from the gland area behind the pump casing | પંપ કેસિંગ પાછળના ગ્લેન્ડ વિસ્તારમાંથી ટપકું અથવા સતત પાણી
safety: Stop the set and isolate it before tightening or replacing any seal parts. | કોઈ પણ સીલ ભાગ કસતા કે બદલતા પહેલાં સેટ બંધ કરો અને આઇસોલેટ કરો.
1. A slow drip of a few drops per minute is normal for a gland packing. Note the rate on the log sheet. | ગ્લેન્ડ પેકિંગમાં મિનિટે થોડાં ટીપાં ટપકવાં સામાન્ય છે. લોગ શીટમાં દર નોંધો.
2. If the leak is steady or the drip rate has increased, check the gland nuts. Tighten them evenly by a quarter turn only. | લિકેજ સતત હોય કે ટીપાંનો દર વધ્યો હોય તો ગ્લેન્ડ નટ તપાસો. તેમને માત્ર પા વળાંક સમાન રીતે કસો.
3. If tightening does not reduce the leak, isolate the set and replace the gland packing. | કસવાથી લિકેજ ઓછું ન થાય તો સેટને આઇસોલેટ કરી ગ્લેન્ડ પેકિંગ બદલો.
4. If the leak comes from the mechanical seal face, do not tighten. Replace the mechanical seal kit. | લિકેજ મિકેનિકલ સીલ ફેસમાંથી હોય તો કસશો નહીં. મિકેનિકલ સીલ કીટ બદલો.
5. Check the seal flush line for a blocked orifice. A blocked flush causes early seal wear. | સીલ ફ્લશ લાઇનમાં ઓરિફિસ બ્લોક થયેલું છે કે નહીં તે તપાસો. બ્લોક ફ્લશથી સીલ વહેલી ઘસાય છે.
note: Keep spare seal kits in the store for this model. A leak that is not stopped can damage the shaft sleeve. | આ મોડેલ માટે સ્ટોરમાં વધારાની સીલ કીટ રાખો. ન અટકેલું લિકેજ શાફ્ટ સ્લીવને નુકસાન કરી શકે છે.

## FAULT-07 | Control panel is dead or shows no display | કંટ્રોલ પેનલ બંધ છે અથવા ડિસ્પ્લે બતાવતું નથી
codes: F-01
symptom: No lamps, no display and no response to the buttons | કોઈ લેમ્પ નહીં, ડિસ્પ્લે નહીં અને બટનનો કોઈ પ્રતિસાદ નહીં
safety: Only a qualified electrician should open the panel. Use a voltage tester before touching any terminal. | પેનલ ફક્ત લાયકાત ધરાવતા ઇલેક્ટ્રિશિયને જ ખોલવી. કોઈ પણ ટર્મિનલ અડતાં પહેલાં વોલ્ટેજ ટેસ્ટર વાપરો.
1. Check the control fuse on the panel. A blown fuse is the most common cause. Replace it with the same rating only. | પેનલ પરનો કંટ્રોલ ફ્યુઝ તપાસો. ફ્યુઝ ઊડી ગયો હોય તે સૌથી સામાન્ય કારણ છે. તેને એ જ રેટિંગના ફ્યુઝથી બદલો.
2. Measure the 24 V control supply at the power supply unit output. Expected: 24 V DC ±5 %. | પાવર સપ્લાય યુનિટના આઉટપુટ પર 24 V કંટ્રોલ સપ્લાય માપો. અપેક્ષિત: 24 V DC ±5 %.
3. If the output is 0 V, check the input supply to the power supply unit. If the input is correct, replace the power supply unit. | આઉટપુટ 0 V હોય તો પાવર સપ્લાય યુનિટનો ઇનપુટ વીજપુરવઠો તપાસો. ઇનપુટ સાચો હોય તો પાવર સપ્લાય યુનિટ બદલો.
4. If the 24 V supply is correct but the display stays blank, check the display cable plug at the back of the display. | 24 V સપ્લાય સાચો હોય પણ ડિસ્પ્લે ખાલી રહે તો ડિસ્પ્લેની પાછળનો કેબલ પ્લગ તપાસો.
5. Record the panel state and any code shown before the power was lost. | વીજળી જતાં પહેલાં પેનલની સ્થિતિ અને દેખાયેલો કોઈ પણ કોડ નોંધો.
note: F-01 means the control module has lost its configuration. Do not reset the configuration on site; report it to the controls team. | F-01 નો અર્થ છે કે કંટ્રોલ મોડ્યુલે તેની ગોઠવણી ગુમાવી છે. સાઇટ પર ગોઠવણી રીસેટ કરશો નહીં; કંટ્રોલ ટીમને જાણ કરો.
