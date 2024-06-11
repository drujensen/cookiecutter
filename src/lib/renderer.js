const fs = require('fs-extra');
const path = require('path');
const colors = require('colors');

const { getTemplateConfig } = require('./config');
const log = require('./logging');

function replaceFields(string, fields) {
    let result = string;
    Object.keys(fields).forEach(fieldName => {
        result = result.replace(new RegExp(fieldName, 'g'), fields[fieldName]);
    });
    return result;
}

function renderFiles({ templateName, fields }, configLocation) {
    const config = getTemplateConfig(templateName, configLocation);
    const pwd = process.cwd();
    const destinationDirectory = path.resolve(pwd, config.outputPath);
    const skipPatterns = config.skipPatterns || [];
    const templateDirectory = path.resolve(pwd, config.templatePath);
    const isFolderTemplate = isDirectory(templateDirectory);

    const templateFiles = [];
    let filesToOutput = [];

    function isDirectory(p) {
        return fs.statSync(p).isDirectory();
    }

    function shouldSkipPath(filePath) {
        return skipPatterns.some(pattern => new RegExp(pattern).test(filePath));
    }

    function getTemplateFiles(dir) {
        if (shouldSkipPath(dir)) {
            return; // Skip the entire directory if it matches the skip pattern
        }

        if (isDirectory(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach(fileDir => {
                const fileDirWithFolder = path.resolve(dir, fileDir);
                if (isDirectory(fileDirWithFolder)) {
                    getTemplateFiles(fileDirWithFolder);
                } else {
                    templateFiles.push(fileDirWithFolder);
                }
            });
        } else {
            templateFiles.push(dir);
        }
    }

    getTemplateFiles(templateDirectory);

    filesToOutput = templateFiles.map(filePath => {
        if (shouldSkipPath(filePath)) {
            return null; // Return null for files that should be skipped
        }

        if (isFolderTemplate) {
            const { base } = path.parse(templateDirectory);
            return {
                src: filePath,
                dest: path.join(
                    destinationDirectory,
                    replaceFields(base, fields),
                    replaceFields(filePath.replace(templateDirectory, ''), fields)
                ),
            };
        } else {
            const { name, ext } = path.parse(templateDirectory);
            return {
                src: templateDirectory,
                dest: path.join(
                    destinationDirectory,
                    replaceFields(name + ext, fields)
                ),
            };
        }
    }).filter(file => file !== null); // Filter out null entries (skipped files)

    // Check if any of the files we are about to create exist and throw an error if they do.
    filesToOutput.forEach(({ dest }) => {
        if (fs.pathExistsSync(dest)) {
            throw new Error(`${path.relative(pwd, dest)} already exists.`);
        }
    });

    filesToOutput.forEach(({ src, dest }) => {
        const fileContent = replaceFields(fs.readFileSync(src, 'utf8'), fields);
        fs.outputFileSync(dest, fileContent, 'utf8');
        log.addedFile(path.relative(pwd, dest));
    });

    console.log(colors.green.bold('\nHappy editing!', '\n'));
}

module.exports = {
    renderFiles,
};
