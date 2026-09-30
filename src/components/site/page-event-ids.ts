/**
 * Script inline que roda antes do GTM (layout do site): sorteia os event_id desta página. O Pixel (GTM) manda
 * o evento com eventID = aqbEvt.pv / aqbEvt.vc e o servidor manda o mesmo id pela API de Conversões
 * (PageTracker → /api/track/page), e a Meta deduplica. Fica fora do PageTracker ("use client") porque o
 * layout é componente de servidor e precisa do texto do script.
 */
export const pageEventIdsCode = `(function(){try{var r=function(){return Date.now().toString(36)+Math.random().toString(36).slice(2,10)};window.aqbEvt={pv:'pv-'+r(),vc:'vc-'+r()}}catch(e){}})();`;
