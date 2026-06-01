// import { ConfigurationService } from '@common/services/configurationService';
// import { StringParameters } from '@common/utils/parameters';

// export const assertUrlAllowed = async (segment: string, url: URL, config: ConfiurationService): Promise<void> => {
//   const protocols = (await config.getParameter(StringParameters.Content.Allowed.Protocols)).Split(',');
//   const hostnames = (await config.getParameter(StringParameters.Content.Allowed.UrlHostnames)).split(',');

//   // Validate protocol is on the list
//   if (protocols.includes(url.protocol) === false) {
//     throw createError(
//       `${segment} is using ${url.protocol} protocol which is not allowed. Allowed protocols: ${protocols.join(',')}`
//     );
//   }

//   // Validate hostnames for https protocols
//   if (url.protocol == 'https:') {
//     const validHostname = hostnames
//       .map((hostname) => {
//         // If hostname starts with *, strip it - then check if URLs hostname ends with it
//         if (hostname.startsWith('*')) {
//           return url.hostname.endsWith(hostname.replace('*', ''));
//         }
//         // Otherwise check for exact match
//         return url.hostname == hostname;
//       })
//       .some((valid) => valid);

//     if (validHostname == false) {
//       throw createError(`${segment} is using ${url.hostname} hostname which is not on the allow list.`);
//     }
//   }
// };
