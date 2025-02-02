import prettier from "prettier";
import { Route, RouteMap } from "../types.js";
import path from "path";

function writeApiFunction(
    tree: Record<string, any>,
    optionalParamName?: string
) {
    const keys = Object.keys(tree);
    let output = "";

    keys.forEach((key) => {
        if (["GET", "POST", "PUT", "DELETE"].includes(key)) {
            const route = tree[key] as Route;
            let url = route.path;

            if (optionalParamName) {
                url = url
                    .replace(
                        `[[${optionalParamName}]]`,
                        `\${${optionalParamName} ? ${optionalParamName} : ''}`
                    )
                    .replace(
                        `[${optionalParamName}]`,
                        `\${${optionalParamName}}`
                    );
            }

            output += `
                ${route.jsDoc ||
                `/**
                     * ${route.method} ${route.path}
                     */`
                }
                async ${route.method}(init?: RequestInit, fetchFn?: any): Promise<${route.returnType}> {
                    if (fetchFn) {
                        return fetchFn(\`${url}\`, {
                            method: '${route.method}',
                            ...init
                        }).then(res => res.json());
                    } else {
                        return fetch(\`${url}\`, {
                            method: '${route.method}',
                            ...init
                        }).then(res => res.json());
                    }
                },
            `;
        } else if (key.startsWith("[") && key.endsWith("]")) {
            const paramName = key.replace(/[\[\]]/g, "");
            const isOptional = key.startsWith("[[") && key.endsWith("]]");

            output += `
                ${paramName}(${paramName}${isOptional ? "?" : ""}: string) {
                    return {
                        ${writeApiFunction(tree[key], paramName)}
                    }
                }
            `;
        } else {
            // Write the path
            output += `
                '${key}': {
                    ${writeApiFunction(tree[key], optionalParamName)}
                },
            `;
        }
    });

    return output;
}

export default function generateApiClient(routes: RouteMap) {
    routes = Object.fromEntries(
        Object.entries(routes).map(([pathName, routes]) => {
            if (!pathName.startsWith("/")) {
                pathName = pathName.replaceAll("\\", "/");
            }

            pathName = pathName.replace(/^.*src\/routes\//, "");

            return [pathName, routes];
        })
    );

    // Create tree from the route map
    // The structure of this tree determines how the API client is generated
    const tree = Object.keys(routes).reduce(
        (tree, path) => {
            const parts = path.split("/");
            let current = tree;

            parts.forEach((part) => {
                if (part === "+server.ts") {
                    Object.values(routes[path]).forEach((route) => {
                        current[route.method] = routes[path][
                            route.method
                        ] as Route;
                    });
                } else if (!current[part]) {
                    current[part] = {};
                }

                current = current[part];
            });

            return tree;
        },
        {} as Record<string, any>
    );

    return prettier.format(
        `
        /**
         * This file is generated by vite-plugin-sveltekit-api-codegen.
         * Do not edit this file directly, it will be overwritten.
         */
        
        export default {
            ${writeApiFunction(tree)}
        }
    `,
        {
            parser: "typescript",
            tabWidth: 4,
            singleQuote: true,
        }
    );
}
